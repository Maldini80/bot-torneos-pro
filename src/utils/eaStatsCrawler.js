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
        console.log('[CRAWLER] Iniciando recolección de estadísticas...');
        const settings = await getBotSettings();
    if (!manual && !settings.crawlerEnabled) {
        console.log('[CRAWLER] El crawler está desactivado. Abortando.');
        return;
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    if (!manual && !settings.crawlerDays.includes(dayOfWeek)) {
        console.log(`[CRAWLER] Hoy (día ${dayOfWeek}) no está en los días de escaneo configurados. Abortando.`);
        return;
    }

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
                    await updateClubProfile(clubColl, clubId, team.name, match.clubs[clubId]);
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
    11: 'ED', 12: 'EI', 13: 'MP', 14: 'DC'
};

async function updatePlayerProfile(coll, playerName, matchData, clubName, goalsAgainstThisMatch = 0) {
    const pos = POS_MAP[matchData.pos] || matchData.pos || '???';
    const isGK = pos === 'POR';

    const incrementData = {
        'stats.matchesPlayed': 1,
        'stats.goals': parseInt(matchData.goals || 0),
        'stats.assists': parseInt(matchData.assists || 0),
        'stats.passesMade': parseInt(matchData.passesmade || 0),
        'stats.passesAttempted': parseInt(matchData.passesattempted || 0),
        'stats.tacklesMade': parseInt(matchData.tacklesmade || 0),
        'stats.tacklesAttempted': parseInt(matchData.tacklesattempted || 0),
        'stats.shots': parseInt(matchData.shots || 0),
        'stats.shotsOnTarget': parseInt(matchData.shotsongoal || matchData.shotsontarget || 0),
        'stats.interceptions': parseInt(matchData.interceptions || 0),
        'stats.saves': parseInt(matchData.saves || 0),
        'stats.redCards': parseInt(matchData.redcards || 0),
        'stats.yellowCards': parseInt(matchData.yellowcards || 0),
        'stats.mom': parseInt(matchData.mom || 0),
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

async function updateClubProfile(coll, clubId, clubName, matchData) {
    const incrementData = {
        'stats.matchesPlayed': 1,
        'stats.wins': parseInt(matchData.wins || 0),
        'stats.losses': parseInt(matchData.losses || 0),
        'stats.ties': parseInt(matchData.ties || 0),
        'stats.goals': parseInt(matchData.goals || 0),
        'stats.goalsAgainst': parseInt(matchData.goalsAgainst || 0),
        'stats.shots': parseInt(matchData.shots || 0),
        'stats.shotsOnTarget': parseInt(matchData.shotsontarget || matchData.shotsongoal || 0),
        'stats.passesMade': parseInt(matchData.passesmade || 0),
        'stats.passesAttempted': parseInt(matchData.passesattempted || 0),
        'stats.tacklesMade': parseInt(matchData.tacklesmade || 0),
        'stats.tacklesAttempted': parseInt(matchData.tacklesattempted || 0),
        'stats.possession': parseFloat(matchData.possession || 0),
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
