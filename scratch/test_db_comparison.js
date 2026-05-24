import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();

    const dbs = ['test', 'tournamentBotDb'];
    
    for (const dbName of dbs) {
        console.log(`\n=== Database: ${dbName} ===`);
        const db = client.db(dbName);
        
        // 1. Check player_profiles count
        const colls = await db.listCollections().toArray();
        const hasPlayers = colls.some(c => c.name === 'player_profiles');
        console.log(`Has player_profiles collection: ${hasPlayers}`);
        if (hasPlayers) {
            const count = await db.collection('player_profiles').countDocuments();
            console.log(`Number of player profiles: ${count}`);
            
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: 'MonKeyDFFYLU' });
            if (player) {
                console.log(`Found MonKeyDFFYLU in ${dbName}:`);
                console.log(`- stats.vpgPoints: ${player.stats?.vpgPoints}`);
                console.log(`- lastClub: ${player.lastClub}`);
                console.log(`- vpgLeagueSlug: ${player.vpgLeagueSlug}`);
            } else {
                console.log(`MonKeyDFFYLU NOT found in ${dbName}`);
            }
        }
        
        // 2. Check fantasy_leagues
        const hasLeagues = colls.some(c => c.name === 'fantasy_leagues');
        console.log(`Has fantasy_leagues collection: ${hasLeagues}`);
        if (hasLeagues) {
            const count = await db.collection('fantasy_leagues').countDocuments();
            console.log(`Number of leagues: ${count}`);
            
            const leagues = await db.collection('fantasy_leagues').find({}).toArray();
            for (const l of leagues) {
                console.log(`- League: "${l.name}" (ID: ${l._id}) | pointsMode: ${l.pointsMode}`);
                if (l.basePoints) {
                    console.log(`  - basePoints for MonKeyDFFYLU: ${l.basePoints['MonKeyDFFYLU']}`);
                    console.log(`  - basePoints for ruben10_03: ${l.basePoints['ruben10_03']}`);
                    console.log(`  - basePoints for Aaron14: ${l.basePoints['Aaron14']}`);
                }
            }
        }
    }
    
    await client.close();
}

main().catch(console.error);
