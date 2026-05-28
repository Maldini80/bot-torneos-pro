import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    console.log('[DB INSPECT] Conectando a la base de datos...');
    await connectDb();
    const db2 = getDb(); // tournamentBotDb
    
    // Names of Nestor's accounts
    const nestorNames = ["nestor007", "Nestor07_", "NestorO7_"];
    const nestorNamesLower = nestorNames.map(n => n.toLowerCase());

    console.log('[DB INSPECT] Reconstruyendo estadísticas de Nestor desde scanned_matches...');
    
    // Find all matches where a Nestor account played
    const matches = await db2.collection('scanned_matches').find({}).toArray();
    
    let matchesCount = 0;
    let goals = 0;
    let assists = 0;
    let passesMade = 0;
    let passesAttempted = 0;
    let tacklesMade = 0;
    let tacklesAttempted = 0;
    let shots = 0;
    let saves = 0;
    let redCards = 0;
    let yellowCards = 0;
    let cleanSheets = 0;
    const ratings = [];
    let wins = 0;
    let losses = 0;
    let ties = 0;

    const getVal = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
        return 0;
    };

    for (const match of matches) {
        // Find if any nestor played in this match
        let nestorPlayerObj = null;
        let nestorClubId = null;
        
        const clubs = match.clubs || {};
        for (const clubId in match.players || {}) {
            for (const playerId in match.players[clubId]) {
                const player = match.players[clubId][playerId];
                const pName = String(player.playername || player.playerName || '').toLowerCase().trim();
                if (nestorNamesLower.includes(pName)) {
                    nestorPlayerObj = player;
                    nestorClubId = clubId;
                    break;
                }
            }
            if (nestorPlayerObj) break;
        }

        if (nestorPlayerObj) {
            matchesCount++;
            goals += getVal(nestorPlayerObj, 'goals');
            assists += getVal(nestorPlayerObj, 'assists');
            passesMade += getVal(nestorPlayerObj, 'passesMade', 'passesmade', 'passescompleted');
            passesAttempted += getVal(nestorPlayerObj, 'passesAttempted', 'passesattempted', 'passattempts');
            tacklesMade += getVal(nestorPlayerObj, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
            tacklesAttempted += getVal(nestorPlayerObj, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
            shots += getVal(nestorPlayerObj, 'shots');
            saves += getVal(nestorPlayerObj, 'saves');
            redCards += getVal(nestorPlayerObj, 'redCards', 'redcards');
            yellowCards += getVal(nestorPlayerObj, 'yellowCards', 'yellowcards');
            
            const rating = parseFloat(nestorPlayerObj.rating || 0);
            if (rating > 0) ratings.push(rating);

            // Determine win/loss/tie
            const club = clubs[nestorClubId] || {};
            const opponentId = Object.keys(clubs).find(id => id !== nestorClubId);
            const opponent = opponentId ? clubs[opponentId] : {};
            const ourG = parseInt(club.goals || 0);
            const oppG = parseInt(opponent.goals || 0);

            if (ourG > oppG) wins++;
            else if (ourG < oppG) losses++;
            else ties++;

            if (oppG === 0) cleanSheets++;
        }
    }

    console.log(`[DB INSPECT] Estadísticas EA encontradas para Nestor:`);
    console.log(`  Partidos: ${matchesCount}, Goles: ${goals}, Asistencias: ${assists}, Wins: ${wins}, Losses: ${losses}, Ties: ${ties}`);
    console.log(`  Clean Sheets: ${cleanSheets}, Ratings: ${ratings.length} registrados.`);

    // Combina con el mínimo oficial de VPG (si el oficial de VPG es mayor)
    // El oficial de VPG es 38 puntos, 4 partidos, 1 gol en Banano.
    const vpgMatches = 4;
    const vpgGoals = 1;
    const vpgAssists = 0;

    const finalMatches = Math.max(matchesCount, vpgMatches);
    const finalGoals = Math.max(goals, vpgGoals);
    const finalAssists = Math.max(assists, vpgAssists);

    // Si los partidos finales superan los ratings de EA, rellena con la media
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 6.5;
    while (ratings.length < finalMatches) {
        ratings.push(parseFloat(avgRating.toFixed(2)));
    }

    // Actualiza nestor007
    const updateResult = await db2.collection('player_profiles').updateOne(
        { eaPlayerName: "nestor007" },
        {
            $set: {
                "stats.matchesPlayed": finalMatches,
                "stats.goals": finalGoals,
                "stats.assists": finalAssists,
                "stats.passesMade": passesMade,
                "stats.passesAttempted": passesAttempted,
                "stats.tacklesMade": tacklesMade,
                "stats.tacklesAttempted": tacklesAttempted,
                "stats.shots": shots,
                "stats.saves": saves,
                "stats.redCards": redCards,
                "stats.yellowCards": yellowCards,
                "stats.ratings": ratings,
                "stats.cleanSheets": cleanSheets,
                "stats.wins": wins,
                "stats.losses": losses,
                "stats.ties": ties,
                // Asegurar su club oficial
                lastClub: "BANANO ESPORTS",
                vpgTeamSlug: "banano-esport",
                vpgLeagueSlug: "superliga-spain-a"
            }
        }
    );

    console.log('[DB INSPECT] Update result for nestor007:', updateResult);

    // Verify updated Nestor profile
    const updatedNestor = await db2.collection('player_profiles').findOne({ eaPlayerName: "nestor007" });
    console.log('[DB INSPECT] Updated Nestor profile:', JSON.stringify(updatedNestor, null, 2));

    process.exit(0);
}

run().catch(err => {
    console.error('[DB INSPECT] Error:', err);
    process.exit(1);
});
