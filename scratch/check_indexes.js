// scratch/check_indexes.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Collections ---');
    const cols = await db.listCollections().toArray();
    console.log(cols.map(c => c.name));
    
    console.log('\n--- Indexes on fantasy_teams ---');
    try {
        const indexes = await db.collection('fantasy_teams').listIndexes().toArray();
        console.log(indexes);
    } catch (e) {
        console.error('Error listing indexes on fantasy_teams:', e);
    }
    
    console.log('\n--- Indexes on fantasy_leagues ---');
    try {
        const indexes = await db.collection('fantasy_leagues').listIndexes().toArray();
        console.log(indexes);
    } catch (e) {
        console.error('Error listing indexes on fantasy_leagues:', e);
    }
    
    console.log('\n--- Sample fantasy_teams Documents ---');
    const teams = await db.collection('fantasy_teams').find({}).limit(5).toArray();
    console.log(JSON.stringify(teams, null, 2));

    console.log('\n--- Sample fantasy_leagues Documents ---');
    const leagues = await db.collection('fantasy_leagues').find({}).limit(5).toArray();
    console.log(JSON.stringify(leagues, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
