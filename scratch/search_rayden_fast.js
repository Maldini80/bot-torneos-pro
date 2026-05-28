import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Searching scanned_matches for players containing "rayden" using projection...');
        const cursor = db.collection('scanned_matches').find({}, {
            projection: { players: 1, matchId: 1, timestamp: 1, clubs: 1 }
        });
        
        const foundMatches = [];
        for await (const match of cursor) {
            if (!match.players) continue;
            for (const clubId in match.players) {
                for (const pid in match.players[clubId]) {
                    const p = match.players[clubId][pid];
                    if (p.playername && p.playername.toLowerCase().includes('rayden')) {
                        foundMatches.push({
                            matchId: match.matchId,
                            timestamp: new Date(parseInt(match.timestamp) * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
                            clubName: match.clubs?.[clubId]?.details?.name || clubId,
                            playerNameInEA: p.playername,
                            pos: p.pos,
                            rating: p.rating,
                            goals: p.goals || 0,
                            assists: p.assists || 0
                        });
                    }
                }
            }
        }
        
        console.log(`Found ${foundMatches.length} matches in scanned_matches:`);
        console.log(JSON.stringify(foundMatches, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
