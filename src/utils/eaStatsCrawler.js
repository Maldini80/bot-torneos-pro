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

            // === FASE 3: Procesar cada grupo (stats solo de la mejor sesión) ===
            for (const group of groups) {
                // Insertar TODAS las sesiones en scanned_matches (datos crudos)
                for (const match of group) {
                    await matchColl.insertOne(match);
                }

                // Elegir la sesión con más datos para procesar stats
                const bestMatch = findBestSession(group, clubId);

                if (group.length > 1) {
                    console.log(`[CRAWLER] 🔗 ${group.length} sesiones fusionadas vs mismo rival para ${team.name}. Stats de la sesión más completa.`);
                }

                // --- DNF inteligente ---
                let matchMaxSecs = 0;
                if (bestMatch.players && bestMatch.players[clubId]) {
                    Object.values(bestMatch.players[clubId]).forEach(p => {
                        const sec = parseInt(p.secondsPlayed || 0);
                        if (sec > matchMaxSecs) matchMaxSecs = sec;
                    });
                }
                const isShortMatch = matchMaxSecs > 0 && matchMaxSecs < 5200;

                // Process players (solo de la mejor sesión)
                const goalsAgainstThisMatch = bestMatch.clubs && bestMatch.clubs[clubId] ? parseInt(bestMatch.clubs[clubId].goalsAgainst || 0) : 0;
                if (bestMatch.players && bestMatch.players[clubId]) {
                    const playersData = bestMatch.players[clubId];
                    for (const playerId in playersData) {
                        const player = playersData[playerId];
                        const playerName = player.playername;
                        
                        const pm = parseInt(player.passesMade || player.passesmade || 0);
                        const sh = parseInt(player.shots || 0);
                        const tk = parseInt(player.tacklesMade || player.tacklesmade || 0);
                        const hasRealStats = (pm + sh + tk) > 0;

                        if (isShortMatch && !hasRealStats) {
                            console.log(`[CRAWLER] 🔌 DNF sin datos para ${playerName} (${team.name}) en partido ${bestMatch.matchId} (${Math.floor(matchMaxSecs/60)} min). Solo rating.`);
                            await updatePlayerProfileRatingOnly(playerColl, playerName, player, team.name);
                        } else {
                            await updatePlayerProfile(playerColl, playerName, player, team.name, goalsAgainstThisMatch);
                        }
                    }
                }

                // Process club stats (solo de la mejor sesión)
                if (bestMatch.clubs && bestMatch.clubs[clubId]) {
                    await updateClubProfile(clubColl, clubId, team.name, bestMatch.clubs[clubId], bestMatch);
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

async function updatePlayerProfile(coll, playerName, matchData, clubName, goalsAgainstThisMatch = 0) {
    const pos = resolvePos(matchData.pos, matchData.archetypeid);
    const isGK = pos === 'POR';

    // EA API keys son inconsistentes: a veces camelCase, a veces minúsculas
    const getVal = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
        return 0;
    };

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
        'stats.cleanSheets': (isGK && goalsAgainstThisMatch === 0) ? 1 : 0,
        'stats.goalsConceded': isGK ? goalsAgainstThisMatch : 0
    };

    const rating = parseFloat(matchData.rating || 0);

    await coll.updateOne(
        { eaPlayerName: playerName },
        { 
            $set: { lastClub: clubName, lastActive: new Date(), lastPosition: pos },
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
async function updatePlayerProfileRatingOnly(coll, playerName, matchData, clubName) {
    const pos = resolvePos(matchData.pos, matchData.archetypeid);
    const rating = parseFloat(matchData.rating || 0);
    
    // Solo guardar rating (sin incrementar matchesPlayed ni stats)
    await coll.updateOne(
        { eaPlayerName: playerName },
        { 
            $set: { lastClub: clubName, lastActive: new Date(), lastPosition: pos },
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

export { runVpgCrawler };
