import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Searching scanned_matches for Guinea Pink...');
        const guineaMatches = await db.collection('scanned_matches').find({
            $or: [
                { "clubA.clubName": /guinea/i },
                { "clubB.clubName": /guinea/i }
            ]
        }).sort({ timestamp: -1 }).limit(10).toArray();
        
        console.log(`Found ${guineaMatches.length} recent matches for Guinea Pink:`);
        guineaMatches.forEach(m => {
            console.log(`- Match ID: ${m.matchId}, Date: ${m.datetime || m.date}, Teams: ${m.clubA.clubName} vs ${m.clubB.clubName}`);
            // Let's check if there is a player list in the match
            const playersA = m.playersA || [];
            const playersB = m.playersB || [];
            const allPlayers = [...playersA, ...playersB];
            const monkeyPlayer = allPlayers.find(p => String(p.name || p.username || '').toLowerCase().includes('monkey'));
            if (monkeyPlayer) {
                console.log(`  Found player matching 'monkey' in this match:`, JSON.stringify(monkeyPlayer, null, 2));
            }
        });
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
