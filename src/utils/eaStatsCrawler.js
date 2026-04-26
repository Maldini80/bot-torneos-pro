import mongoose from 'mongoose';
import { getBotSettings, getDb } from '../../database.js';
import Team from '../vpg_bot/models/team.js';

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
                        // Cruza medianoche (ej: 21:30 → 00:30)
                        inRange = matchMinutes >= startMin || matchMinutes <= endMin;
                    }
                    if (!inRange) {
                        console.log(`[CRAWLER] ⏰ Partido ${matchId} ignorado (${madridTimeStr}h Madrid, fuera de ${settings.crawlerTimeRange.start}-${settings.crawlerTimeRange.end})`);
                        continue;
                    }
                }

                // Check if match already processed
                const exists = await matchColl.findOne({ matchId });
                if (exists) continue;

                await matchColl.insertOne(match);

                // Process players
                const goalsAgainstThisMatch = match.clubs && match.clubs[clubId] ? parseInt(match.clubs[clubId].goalsAgainst || 0) : 0;
                if (match.players && match.players[clubId]) {
                    const playersData = match.players[clubId];
                    for (const playerId in playersData) {
                        const player = playersData[playerId];
                        const playerName = player.playername;

                        await updatePlayerProfile(playerColl, playerName, player, team.name, goalsAgainstThisMatch);
                    }
                }

                // Process club stats
                if (match.clubs && match.clubs[clubId]) {
                    await updateClubProfile(clubColl, clubId, team.name, match.clubs[clubId], match);
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

// Mapa de ARQUETIPOS de EA FC (clase del jugador, no posición en formación)
const ARCHETYPE_MAP = {
    1: 'POR',   // Muro
    2: 'POR',   // Guardameta Líbero
    3: 'DFC',   // Impulso
    4: 'DFC',   // Líder
    5: 'DFC',   // Motor
    6: 'DFC',   // Amenaza
    7: 'MC',    // Nexo
    8: 'MC',    // Guía
    9: 'MC',    // Artista
    10: 'MI',   // Chispa → Carrilero
    11: 'DC',   // Mago
    12: 'MI',   // Killer → Carrilero
    13: 'DC',   // Finalizador
};

async function updatePlayerProfile(coll, playerName, matchData, clubName, goalsAgainstThisMatch = 0) {
    // Priorizar archetypeid (clase del jugador) sobre pos (texto genérico como "midfielder")
    const pos = ARCHETYPE_MAP[matchData.archetypeid] || POS_MAP[matchData.pos] || matchData.pos || '???';
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

async function updateClubProfile(coll, clubId, clubName, matchClubData, matchData) {
    const clubIds = Object.keys(matchData.clubs || {});
    const opponentId = clubIds.find(id => id !== clubId);
    const opponentClub = opponentId ? (matchData.clubs[opponentId] || {}) : {};
    
    const ourGoals = parseInt(matchClubData.goals || 0);
    const oppGoals = parseInt(opponentClub.goals || 0);
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

export { runVpgCrawler };
