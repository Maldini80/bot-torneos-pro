import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzRaydenzz";
        const playerProfiles = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        console.log(`Profiles found: ${playerProfiles.length}`);
        for (const p of playerProfiles) {
            console.log(`Profile: ${p.eaPlayerName}`);
            console.log(` - lastPosition: ${p.lastPosition}`);
            console.log(` - vpgLeagueSlug: ${p.vpgLeagueSlug}`);
            console.log(` - stats:`, p.stats);
        }
        
        // Let's search all leagues in MongoDB database to see if his name appears in any of their leaderboard caches or basePoints
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log(`\nSearching fantasy leagues basePoints for ${playerName}...`);
        for (const l of leagues) {
            const basePoints = l.basePoints || {};
            const keys = Object.keys(basePoints).filter(k => k.toLowerCase() === playerName.toLowerCase());
            if (keys.length > 0) {
                console.log(`Found in League "${l.name}" basePoints:`);
                keys.forEach(k => {
                    console.log(` - Key: "${k}" -> Points: ${basePoints[k]}`);
                });
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
