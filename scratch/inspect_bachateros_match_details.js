import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const m = await db.collection('scanned_matches').findOne({ matchId: "652354833180132" });
        if (m) {
            console.log('=== MATCH DETAILS ===');
            console.log(`Match ID: ${m.matchId}`);
            console.log(`Timestamp: ${m.timestamp} (${new Date(parseInt(m.timestamp)*1000)})`);
            
            const playersRoot = m.players || {};
            for (const clubId of Object.keys(playersRoot)) {
                const clubProfile = await db.collection('club_profiles').findOne({ eaClubId: clubId });
                console.log(`\nClub ID: ${clubId} (${clubProfile ? clubProfile.eaClubName : 'Desconocido'})`);
                
                const clubPlayers = playersRoot[clubId] || {};
                for (const playerId of Object.keys(clubPlayers)) {
                    const p = clubPlayers[playerId];
                    console.log(`  - Player ID: ${playerId} | Player Name: ${p.playername} | Rating: ${p.rating} | Pos: ${p.pos}`);
                }
            }
        } else {
            console.log('Match 652354833180132 not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
