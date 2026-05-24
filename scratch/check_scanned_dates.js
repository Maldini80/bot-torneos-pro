// scratch/check_scanned_dates.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Checking Scanned Matches Dates ---');
    const totalMatches = await db.collection('scanned_matches').countDocuments({});
    console.log(`Total matches in scanned_matches: ${totalMatches}`);
    
    if (totalMatches > 0) {
        const oldestMatch = await db.collection('scanned_matches').find({}).sort({ timestamp: 1 }).limit(1).toArray();
        const newestMatch = await db.collection('scanned_matches').find({}).sort({ timestamp: -1 }).limit(1).toArray();
        
        const oldestDate = new Date(parseInt(oldestMatch[0].timestamp) * 1000);
        const newestDate = new Date(parseInt(newestMatch[0].timestamp) * 1000);
        
        console.log(`Oldest match timestamp: ${oldestMatch[0].timestamp} (${oldestDate.toLocaleString('es-ES')})`);
        console.log(`Newest match timestamp: ${newestMatch[0].timestamp} (${newestDate.toLocaleString('es-ES')})`);
    } else {
        console.log('No matches found in scanned_matches.');
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
