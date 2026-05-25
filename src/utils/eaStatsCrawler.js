import mongoose from 'mongoose';
import { getBotSettings, getDb } from '../../database.js';
import Team from '../vpg_bot/models/team.js';
import { extractMatchInfo } from './matchUtils.js';

const EA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.ea.com/"
};

let isCrawlerRunning = false;

/**
 * Función principal del Crawler VPG
 */
async function runVpgCrawler(manual = false, onProgress = null) {
    if (isCrawlerRunning) {
        throw new Error('CRAWLER_ALREADY_RUNNING');
    }
    isCrawlerRunning = true;

    try {
        const settings = await getBotSettings();
    if (!manual && !settings.crawlerEnabled) {
        console.log('[CRAWLER] ⏸️ Crawler desactivado en configuración. No se ejecuta.');
        return;
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    if (!manual && !settings.crawlerDays.includes(dayOfWeek)) {
        console.log(`[CRAWLER] ⏸️ Hoy es ${dayNames[dayOfWeek]} — no está en los días configurados (${settings.crawlerDays.map(d => dayNames[d]).join(', ')}). No se ejecuta.`);
        return;
    }

    console.log('[CRAWLER] ▶️ Iniciando recolección de estadísticas...');

    const db = getDb();
    if (!db) {
        console.error('[CRAWLER] No hay conexión a DB.');
        return;
    }

    const teams = await Team.find({ eaClubId: { $ne: null } });
    console.log(`[CRAWLER] Encontrados ${teams.length} equipos para analizar.`);

    const matchColl = db.collection('scanned_matches');
    const playerColl = db.collection('player_profiles');
    const clubColl = db.collection('club_profiles');

    let i = 0;
    const totalTeams = teams.length;

    for (const team of teams) {
        i++;
        const platform = team.eaPlatform || 'common-gen5';
        const clubId = team.eaClubId;
        console.log(`[CRAWLER] Procesando equipo: ${team.name} (ClubID: ${clubId})`);

        try {
            // Normally competitive matches are friendlies or clubMatch
            const url = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubId}&platform=${platform}&matchType=friendlyMatch`;
            const res = await fetch(url, { headers: EA_HEADERS });
            if (!res.ok) continue;

            let matches = await res.json();
            if (!Array.isArray(matches)) {
                matches = Object.values(matches || {});
            }

            console.log(`[CRAWLER] API devolvió ${matches.length} partidos para ${team.name}`);

            // === FASE 1: Filtrar partidos nuevos por franja horaria y duplicados ===
            const newMatches = [];
            for (const match of matches) {
                const matchId = match.matchId;
                const matchTimestamp = parseInt(match.timestamp) * 1000;
                const matchDate = new Date(matchTimestamp);

                // Filtro horario: solo guardar partidos dentro de la franja configurada (hora Madrid)
                if (settings.crawlerTimeRange) {
                    const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                    const [h, min] = madridTimeStr.split(':').map(Number);
                    const matchMinutes = h * 60 + min;
                    const [sh, sm] = settings.crawlerTimeRange.start.split(':').map(Number);
                    const [eh, em] = settings.crawlerTimeRange.end.split(':').map(Number);
                    const startMin = sh * 60 + sm;
                    const endMin = eh * 60 + em;

                    let inRange;
                    if (startMin <= endMin) {
                        inRange = matchMinutes >= startMin && matchMinutes <= endMin;
                    } else {
                        inRange = matchMinutes >= startMin || matchMinutes <= endMin;
                    }
                    if (!inRange) {
                        console.log(`[CRAWLER] ⏰ Partido ${matchId} ignorado (${madridTimeStr}h Madrid, fuera de ${settings.crawlerTimeRange.start}-${settings.crawlerTimeRange.end})`);
                        continue;
                    }
                }

                const exists = await matchColl.findOne({ matchId });
                if (exists) continue;

                newMatches.push(match);
            }

            if (newMatches.length === 0) continue;

            // === FASE 2: Agrupar por rival dentro de ventana de 3h ===
            const groups = groupMatchesByOpponent(newMatches, clubId);

            // === FASE 3: Procesar cada grupo (agregando sesiones si hay desconexiones) ===
            for (const group of groups) {
                // Insertar TODAS las sesiones en scanned_matches (datos crudos)
                for (const match of group) {
                    await matchColl.insertOne(match);
                }

                // Agregamos las estadísticas de todas las sesiones del grupo (DNF inteligente)
                const aggregated = aggregateGroupStats(group, clubId);
                const isShortMatch = aggregated.maxSecs > 0 && aggregated.maxSecs < 5200;

                if (group.length > 1) {
                    console.log(`[CRAWLER] 🔗 ${group.length} sesiones fusionadas vs mismo rival para ${team.name}. Goles: ${aggregated.goals} - ${aggregated.goalsAgainst} (${Math.floor(aggregated.maxSecs/60)} min totales).`);
                }

                const isWin = aggregated.goals > aggregated.goalsAgainst ? 1 : 0;
                const isTie = aggregated.goals === aggregated.goalsAgainst ? 1 : 0;

                // Process players (con los datos agregados)
                for (const playerName in aggregated.players) {
                    const player = aggregated.players[playerName];
                    
                    const pm = player.passesMade || 0;
                    const sh = player.shots || 0;
                    const tk = player.tacklesMade || 0;
                    const hasRealStats = (pm + sh + tk) > 0;

                    const isVpgClub = !!(team.vpgLeagueSlug || (team.get && team.get('vpgLeagueSlug')));
                    if (isShortMatch && !hasRealStats) {
                        console.log(`[CRAWLER] 🔌 DNF sin datos para ${playerName} (${team.name}) en grupo de ${group.length} sesiones. Solo rating.`);
                        await updatePlayerProfileRatingOnly(playerColl, playerName, player, team.name, isVpgClub);
                    } else {
                        await updatePlayerProfile(playerColl, playerName, player, team.name, aggregated.goalsAgainst, isWin, isTie, isVpgClub);
                    }
                }

                // Process club stats (usando la mejor sesión como base pero con los goles y goles en contra correctos de la fusión)
                const bestMatch = findBestSession(group, clubId);
                if (bestMatch.clubs && bestMatch.clubs[clubId]) {
                    const clubStats = {
                        ...bestMatch.clubs[clubId],
                        goals: String(aggregated.goals),
                        goalsAgainst: String(aggregated.goalsAgainst)
                    };
                    await updateClubProfile(clubColl, clubId, team.name, clubStats, bestMatch);
                }
            }
        } catch (error) {
            console.error(`[CRAWLER] Error procesando equipo ${team.name}:`, error);
        }
        if (onProgress) {
            await onProgress(i, totalTeams, team.name).catch(() => {});
        }
    }
    console.log('[CRAWLER] Recolección de estadísticas finalizada.');
    return totalTeams;
    } finally {
        isCrawlerRunning = false;
    }
}

const POS_MAP = {
    0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
    6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
    11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC',
    'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
    'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
    'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
    'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC',
    'striker': 'DC', 'winger': 'ED', 'wing': 'ED'
};

// Resuelve la posición combinando pos (categoría EA) + archetypeid (clase del jugador)
// pos indica la zona general (goalkeeper, defender, midfielder, forward)
// archetypeid distingue el rol exacto dentro de esa zona
function resolvePos(posRaw, archetypeid) {
    // Si pos es numérico (raro pero posible), usar POS_MAP directo
    if (!isNaN(posRaw) && POS_MAP[posRaw] !== undefined) return POS_MAP[posRaw];

    const p = String(posRaw || '').toLowerCase();

    // Portero: siempre POR
    if (p === 'goalkeeper') return 'POR';

    // Delantero: siempre DC (incluso si el arquetipo es Killer/Chispa)
    if (p === 'forward' || p === 'attacker' || p === 'striker') return 'DC';

    // Defensa: siempre DFC
    if (p === 'defender' || p === 'centerback') return 'DFC';

    // Mediocampista: usar archetypeid para distinguir carrileros de centrocampistas
    if (p === 'midfielder') {
        if (archetypeid == 10 || archetypeid == 12) return 'CARR'; // Chispa/Killer → Carrilero
        return 'MC';
    }

    // Fallback: texto de POS_MAP o crudo
    return POS_MAP[posRaw] || posRaw || '???';
}

function extractBuild(matchData) {
    const attrString = matchData.vproattr || "";
    const attrParts = attrString.split('|');
    let height = null, weight = null;
    if (attrParts.length >= 2) {
        const last3 = attrParts.slice(-3);
        for (const val of last3) {
            const num = parseInt(val);
            if (!isNaN(num)) {
                if (num >= 150 && num <= 220 && !height) height = num;
                else if (num >= 45 && num <= 130 && !weight) weight = num;
            }
        }
    }
    
    const perks = {};
    for (let i = 0; i < 5; i++) {
        if (matchData[`match_event_aggregate_${i}`] !== undefined) {
            perks[`event_${i}`] = matchData[`match_event_aggregate_${i}`];
        }
    }
    if (matchData.vprohackreason) perks.hackreason = matchData.vprohackreason;

    return { height, weight, perks, vproattr: matchData.vproattr || null };
}

async function updatePlayerProfile(coll, playerName, matchData, clubName, goalsAgainstThisMatch = 0, isWin = 0, isTie = 0, isVpgClub = false) {
    const pos = resolvePos(matchData.pos, matchData.archetypeid);
    const isGK = pos === 'POR';

    const build = extractBuild(matchData);

    // Evitar que partidos locales/EA pisen el club de VPG de jugadores ya sincronizados
    const existing = await coll.findOne({ eaPlayerName: playerName });
    let finalClubName = clubName;
    let isVpg = isVpgClub;
    if (existing) {
        if (existing.vpgLeagueSlug) {
            isVpg = true;
            finalClubName = existing.lastClub || clubName;
        }
    }

    if (isVpg) {
        // Para jugadores de VPG, no modificar ni crear perfil desde el crawler de EA.
        // Los datos del Fantasy provienen 100% de la API oficial de VPG.
        return;
    }

    // EA API keys son inconsistentes: a veces camelCase, a veces minúsculas
    const getVal = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
        return 0;
    };

    const isLoss = (isWin === 0 && isTie === 0) ? 1 : 0;

    const incrementData = {
        'stats.matchesPlayed': 1,
        'stats.goals': getVal(matchData, 'goals'),
        'stats.assists': getVal(matchData, 'assists'),
        'stats.passesMade': getVal(matchData, 'passesMade', 'passesmade', 'passescompleted'),
        'stats.passesAttempted': getVal(matchData, 'passesAttempted', 'passesattempted', 'passattempts'),
        'stats.tacklesMade': getVal(matchData, 'tacklesMade', 'tacklesmade', 'tacklescompleted'),
        'stats.tacklesAttempted': getVal(matchData, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts'),
        'stats.shots': getVal(matchData, 'shots'),
        'stats.shotsOnTarget': getVal(matchData, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal'),
        'stats.interceptions': getVal(matchData, 'interceptions'),
        'stats.saves': getVal(matchData, 'saves'),
        'stats.redCards': getVal(matchData, 'redCards', 'redcards'),
        'stats.yellowCards': getVal(matchData, 'yellowCards', 'yellowcards'),
        'stats.mom': getVal(matchData, 'mom'),
        'stats.cleanSheets': (goalsAgainstThisMatch === 0) ? 1 : 0,
        'stats.goalsConceded': isGK ? goalsAgainstThisMatch : 0,
        'stats.wins': isWin,
        'stats.losses': isLoss,
        'stats.ties': isTie
    };

    const rating = parseFloat(matchData.rating || 0);

    await coll.updateOne(
        { eaPlayerName: playerName },
        { 
            $set: { lastClub: finalClubName, lastActive: new Date(), lastPosition: pos, build: build },
            $inc: incrementData,
            $push: { 'stats.ratings': rating }
        },
        { upsert: true }
    );
}

/**
 * Solo guarda el rating del jugador en un partido DNF, sin incrementar estadísticas.
 * Esto evita que los datos vacíos de una desconexión diluyan las medias del jugador.
 */
async function updatePlayerProfileRatingOnly(coll, playerName, matchData, clubName, isVpgClub = false) {
    const pos = resolvePos(matchData.pos, matchData.archetypeid);
    const build = extractBuild(matchData);
    
    // Evitar que partidos locales/EA pisen el club de VPG de jugadores ya sincronizados
    const existing = await coll.findOne({ eaPlayerName: playerName });
    let finalClubName = clubName;
    let isVpg = isVpgClub;
    if (existing) {
        if (existing.vpgLeagueSlug) {
            isVpg = true;
            finalClubName = existing.lastClub || clubName;
        }
    }

    if (isVpg) {
        // Para jugadores de VPG, no modificar ni crear perfil desde el crawler de EA.
        // Los datos del Fantasy provienen 100% de la API oficial de VPG.
        return;
    }

    const rating = parseFloat(matchData.rating || 0);
    // Solo guardar rating (sin incrementar matchesPlayed ni stats)
    await coll.updateOne(
        { eaPlayerName: playerName },
        { 
            $set: { lastClub: finalClubName, lastActive: new Date(), lastPosition: pos, build: build },
            $push: { 'stats.ratings': rating }
        },
        { upsert: true }
    );
}

async function updateClubProfile(coll, clubId, clubName, matchClubData, matchData) {
    const info = extractMatchInfo(matchData, clubId);
    
    const ourGoals = info.ourGoals;
    const oppGoals = info.oppGoals;
    const isWin = ourGoals > oppGoals ? 1 : 0;
    const isLoss = ourGoals < oppGoals ? 1 : 0;
    const isTie = ourGoals === oppGoals ? 1 : 0;

    const gv = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return parseInt(obj[k]) || 0; }
        return 0;
    };
    const gf = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return parseFloat(obj[k]) || 0; }
        return 0;
    };

    // EA API NO devuelve tiros/pases/entradas a nivel de club — hay que sumarlos de los jugadores
    let teamShots = 0, teamShotsOT = 0, teamPassesMade = 0, teamPassesAtt = 0, teamTacklesMade = 0, teamTacklesAtt = 0;
    if (matchData.players && matchData.players[clubId]) {
        for (const pid in matchData.players[clubId]) {
            const p = matchData.players[clubId][pid];
            teamShots += gv(p, 'shots');
            teamShotsOT += gv(p, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal');
            teamPassesMade += gv(p, 'passesMade', 'passesmade', 'passescompleted');
            teamPassesAtt += gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
            teamTacklesMade += gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
            teamTacklesAtt += gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
        }
    }

    // Fallback: si el club SÍ tiene datos, usarlos (por si EA alguna vez los devuelve)
    const clubShots = gv(matchClubData, 'shots');
    const clubPassesMade = gv(matchClubData, 'passesMade', 'passesmade');

    const incrementData = {
        'stats.matchesPlayed': 1,
        'stats.wins': isWin,
        'stats.losses': isLoss,
        'stats.ties': isTie,
        'stats.goals': ourGoals,
        'stats.goalsAgainst': gv(matchClubData, 'goalsAgainst', 'goalsagainst'),
        'stats.shots': clubShots || teamShots,
        'stats.shotsOnTarget': gv(matchClubData, 'shotsOnTarget', 'shotsontarget', 'shotsongoal') || teamShotsOT,
        'stats.passesMade': clubPassesMade || teamPassesMade,
        'stats.passesAttempted': gv(matchClubData, 'passesAttempted', 'passesattempted') || teamPassesAtt,
        'stats.tacklesMade': gv(matchClubData, 'tacklesMade', 'tacklesmade') || teamTacklesMade,
        'stats.tacklesAttempted': gv(matchClubData, 'tacklesAttempted', 'tacklesattempted') || teamTacklesAtt,
        'stats.possession': gf(matchClubData, 'possession'),
        'stats.possessionCount': 1
    };

    await coll.updateOne(
        { eaClubId: clubId },
        {
            $set: { eaClubName: clubName, lastActive: new Date() },
            $inc: incrementData
        },
        { upsert: true }
    );
}

/**
 * Agrupa partidos del mismo rival dentro de una ventana de 3 horas.
 * Esto evita contar sesiones de un mismo partido (ej: 46+48 min) como 2 partidos distintos.
 */
function groupMatchesByOpponent(matches, clubId) {
    const sorted = [...matches].sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
    const groups = [];
    const used = new Set();

    for (let i = 0; i < sorted.length; i++) {
        if (used.has(i)) continue;
        const match = sorted[i];
        const opponentId = Object.keys(match.clubs || {}).find(id => id !== String(clubId));
        const group = [match];
        used.add(i);

        for (let j = i + 1; j < sorted.length; j++) {
            if (used.has(j)) continue;
            const nextMatch = sorted[j];
            const nextOpponentId = Object.keys(nextMatch.clubs || {}).find(id => id !== String(clubId));
            const timeDiff = Math.abs(parseInt(match.timestamp) - parseInt(nextMatch.timestamp));

            if (nextOpponentId === opponentId && timeDiff < 3 * 3600) {
                group.push(nextMatch);
                used.add(j);
            }
        }

        groups.push(group);
    }

    return groups;
}

/**
 * De un grupo de sesiones contra el mismo rival, devuelve la sesión con más datos.
 * Prioriza: (1) sesiones con stats reales, (2) la más larga.
 */
function findBestSession(group, clubId) {
    if (group.length === 1) return group[0];

    let best = group[0];
    let bestScore = 0;

    for (const match of group) {
        let maxSecs = 0;
        let hasRealStats = false;

        if (match.players && match.players[String(clubId)]) {
            for (const p of Object.values(match.players[String(clubId)])) {
                const sec = parseInt(p.secondsPlayed || 0);
                if (sec > maxSecs) maxSecs = sec;
                const pm = parseInt(p.passesMade || p.passesmade || 0);
                const sh = parseInt(p.shots || 0);
                const tk = parseInt(p.tacklesMade || p.tacklesmade || 0);
                if ((pm + sh + tk) > 0) hasRealStats = true;
            }
        }

        // Priorizar: sesión con stats reales (peso 10000) + duración
        const score = (hasRealStats ? 10000 : 0) + maxSecs;
        if (score > bestScore) {
            bestScore = score;
            best = match;
        }
    }

    return best;
}

/**
 * Agrega y fusiona las estadísticas de un grupo de sesiones del mismo partido (desconexiones).
 */
function aggregateGroupStats(group, clubId) {
    let totalGoals = 0;
    let totalGoalsAgainst = 0;
    let maxSecs = 0;
    const aggregatedPlayers = {};

    const getVal = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
        return 0;
    };

    for (const match of group) {
        const clubStats = match.clubs && match.clubs[String(clubId)] ? match.clubs[String(clubId)] : {};
        let goals = parseInt(clubStats.goals || 0);
        let goalsAgainst = parseInt(clubStats.goalsAgainst || 0);

        const opponentId = Object.keys(match.clubs || {}).find(id => id !== String(clubId));

        // Detectar goles fantasma del 3-0 DNF de EA
        if ((goals === 3 && goalsAgainst === 0) || (goals === 0 && goalsAgainst === 3)) {
            let maxGoalsConceded = 0;
            if (match.players && match.players[String(clubId)]) {
                Object.values(match.players[String(clubId)]).forEach(p => {
                    const conceded = getVal(p, 'goalsconceded', 'goalsConceded');
                    if (conceded > maxGoalsConceded) maxGoalsConceded = conceded;
                });
            }
            let maxOppGoalsConceded = 0;
            if (match.players && opponentId && match.players[opponentId]) {
                Object.values(match.players[opponentId]).forEach(p => {
                    const conceded = getVal(p, 'goalsconceded', 'goalsConceded');
                    if (conceded > maxOppGoalsConceded) maxOppGoalsConceded = conceded;
                });
            }
            
            let trueOurGoals = maxOppGoalsConceded;  // Lo que el rival encajó = nuestros goles
            let trueOppGoals = maxGoalsConceded;     // Lo que nosotros encajamos = goles del rival
            
            if (trueOurGoals === 0 && trueOppGoals === 0) {
                let realOur = 0, realOpp = 0;
                if (match.players && match.players[String(clubId)]) {
                    realOur = Object.values(match.players[String(clubId)]).reduce((s, p) => s + getVal(p, 'goals'), 0);
                }
                if (match.players && opponentId && match.players[opponentId]) {
                    realOpp = Object.values(match.players[opponentId]).reduce((s, p) => s + getVal(p, 'goals'), 0);
                }
                if (realOur > 0 || realOpp > 0) {
                    trueOurGoals = realOur;
                    trueOppGoals = realOpp;
                }
            }

            if (goals !== trueOurGoals || goalsAgainst !== trueOppGoals) {
                goals = trueOurGoals;
                goalsAgainst = trueOppGoals;
            }
        }

        totalGoals += goals;
        totalGoalsAgainst += goalsAgainst;

        // Sumar estadísticas de los jugadores
        if (match.players && match.players[String(clubId)]) {
            const playersData = match.players[String(clubId)];
            for (const playerId in playersData) {
                const player = playersData[playerId];
                const playerName = player.playername || player.playerName || playerId;
                const secs = parseInt(player.secondsPlayed || player.secondsplayed || 0);
                const rating = parseFloat(player.rating || 0);

                if (secs > maxSecs) maxSecs = secs;

                if (!aggregatedPlayers[playerName]) {
                    aggregatedPlayers[playerName] = {
                        playername: playerName,
                        pos: player.pos,
                        archetypeid: player.archetypeid,
                        goals: 0,
                        assists: 0,
                        passesMade: 0,
                        passesAttempted: 0,
                        tacklesMade: 0,
                        tacklesAttempted: 0,
                        shots: 0,
                        shotsOnTarget: 0,
                        interceptions: 0,
                        saves: 0,
                        redCards: 0,
                        yellowCards: 0,
                        mom: 0,
                        _bestRating: rating,
                        _maxRatingSecs: secs,
                        vproattr: player.vproattr
                    };
                } else {
                    // Tomar la posición y rating de la sesión donde haya jugado más tiempo
                    if (secs > aggregatedPlayers[playerName]._maxRatingSecs) {
                        aggregatedPlayers[playerName]._maxRatingSecs = secs;
                        aggregatedPlayers[playerName]._bestRating = rating;
                        aggregatedPlayers[playerName].pos = player.pos;
                        aggregatedPlayers[playerName].archetypeid = player.archetypeid;
                        if (player.vproattr) aggregatedPlayers[playerName].vproattr = player.vproattr;
                    }
                }

                aggregatedPlayers[playerName].goals += getVal(player, 'goals');
                aggregatedPlayers[playerName].assists += getVal(player, 'assists');
                aggregatedPlayers[playerName].passesMade += getVal(player, 'passesMade', 'passesmade', 'passescompleted');
                aggregatedPlayers[playerName].passesAttempted += getVal(player, 'passesAttempted', 'passesattempted', 'passattempts');
                aggregatedPlayers[playerName].tacklesMade += getVal(player, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                aggregatedPlayers[playerName].tacklesAttempted += getVal(player, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                aggregatedPlayers[playerName].shots += getVal(player, 'shots');
                aggregatedPlayers[playerName].shotsOnTarget += getVal(player, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal');
                aggregatedPlayers[playerName].interceptions += getVal(player, 'interceptions');
                aggregatedPlayers[playerName].saves += getVal(player, 'saves');
                aggregatedPlayers[playerName].redCards += getVal(player, 'redCards', 'redcards');
                aggregatedPlayers[playerName].yellowCards += getVal(player, 'yellowCards', 'yellowcards');
                aggregatedPlayers[playerName].mom = Math.max(aggregatedPlayers[playerName].mom, getVal(player, 'mom'));
            }
        }
    }

    // Mapear el mejor rating a rating
    for (const playerName in aggregatedPlayers) {
        const p = aggregatedPlayers[playerName];
        p.rating = p._bestRating;
        delete p._bestRating;
        delete p._maxRatingSecs;
    }

    return {
        goals: totalGoals,
        goalsAgainst: totalGoalsAgainst,
        maxSecs,
        players: aggregatedPlayers
    };
}

export { runVpgCrawler };
