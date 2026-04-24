import { getDb } from './database.js';

async function test() {
    const db = getDb();
    const t = await db.collection('tournaments').findOne({shortId: 'blitz-2304-s'});
    let count = 0;
    if (t && t.structure && t.structure.calendario) {
        for (const g of Object.values(t.structure.calendario)) {
            for (const m of g) {
                if (m.eaStats) count++;
            }
        }
    }
    console.log("Matches con eaStats: " + count);
    process.exit(0);
}

test().catch(console.error);
