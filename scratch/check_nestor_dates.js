import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    
    const nestorNames = ["nestor007", "Nestor07_", "NestorO7_"];
    const nestorNamesLower = nestorNames.map(n => n.toLowerCase());

    const matches = await db.collection('scanned_matches').find({}).toArray();
    console.log(`Total scanned matches in DB: ${matches.length}`);

    const nestorMatches = [];
    let sampleClubObj = null;

    for (const match of matches) {
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
            const date = match.timestamp ? new Date(parseInt(match.timestamp) * 1000) : null;
            const clubObj = clubs[nestorClubId];
            if (clubObj && !sampleClubObj) {
                sampleClubObj = clubObj;
            }
            const clubName = clubObj?.name || clubObj?.clubName || clubObj?.details?.name || 'Unknown';
            const opponentId = Object.keys(clubs).find(id => id !== nestorClubId);
            const opponentObj = opponentId ? clubs[opponentId] : null;
            const opponentName = opponentObj ? (opponentObj.name || opponentObj.clubName || opponentObj.details?.name || 'Unknown') : 'None';
            const goals = nestorPlayerObj.goals || 0;
            const assists = nestorPlayerObj.assists || 0;

            nestorMatches.push({
                timestamp: match.timestamp,
                date: date ? date.toISOString().split('T')[0] : 'No date',
                clubId: nestorClubId,
                clubName,
                opponentName,
                playerName: nestorPlayerObj.playername || nestorPlayerObj.playerName,
                goals,
                assists
            });
        }
    }

    if (sampleClubObj) {
        console.log('Sample club object structure:', JSON.stringify(sampleClubObj, null, 2));
    }

    // Sort by timestamp/date ascending
    nestorMatches.sort((a, b) => (parseInt(a.timestamp || 0) - parseInt(b.timestamp || 0)));

    console.log(`Nestor played in ${nestorMatches.length} matches.`);
    
    // Group by clubName and date ranges
    const clubsPlayed = {};
    nestorMatches.forEach(m => {
        if (!clubsPlayed[m.clubName]) {
            clubsPlayed[m.clubName] = {
                count: 0,
                minDate: m.date,
                maxDate: m.date,
                goals: 0,
                assists: 0
            };
        }
        const c = clubsPlayed[m.clubName];
        c.count++;
        c.goals += parseInt(m.goals) || 0;
        c.assists += parseInt(m.assists) || 0;
        if (m.date < c.minDate) c.minDate = m.date;
        if (m.date > c.maxDate) c.maxDate = m.date;
    });

    console.log('\n--- breakdown by club ---');
    console.log(JSON.stringify(clubsPlayed, null, 2));

    console.log('\n--- detail of matches (first 5 and last 5) ---');
    console.log('First 5 matches:');
    nestorMatches.slice(0, 5).forEach((m, idx) => {
        console.log(`[${idx+1}] Date: ${m.date} | Player: ${m.playerName} | Club: ${m.clubName} vs ${m.opponentName} | Goals: ${m.goals}, Assists: ${m.assists}`);
    });
    console.log('Last 5 matches:');
    nestorMatches.slice(-5).forEach((m, idx) => {
        console.log(`[${nestorMatches.length - 5 + idx + 1}] Date: ${m.date} | Player: ${m.playerName} | Club: ${m.clubName} vs ${m.opponentName} | Goals: ${m.goals}, Assists: ${m.assists}`);
    });

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
