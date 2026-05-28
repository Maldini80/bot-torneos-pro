import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const m = await db.collection('scanned_matches').findOne({ matchId: "585050388830115" });
        if (m) {
            console.log('=== MATCH DETAILS 585050388830115 ===');
            console.log(`Match ID: ${m.matchId}`);
            
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
            console.log('Match 585050388830115 not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
