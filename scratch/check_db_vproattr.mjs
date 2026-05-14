import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function run() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/vpg_bot";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        const matches = await db.collection('scanned_matches').find({}).sort({timestamp: -1}).limit(500).toArray();
        let nhCount = 0;
        let validCount = 0;
        let sample = "";
        
        for (const m of matches) {
            if (m.players) {
                for (const cid in m.players) {
                    for (const pid in m.players[cid]) {
                        const p = m.players[cid][pid];
                        if (p.vproattr === 'NH') {
                            nhCount++;
                        } else if (p.vproattr && p.vproattr.length > 5) {
                            validCount++;
                            if (!sample) sample = p.vproattr;
                        }
                    }
                }
            }
        }
        
        console.log(`vproattr = 'NH': ${nhCount}`);
        console.log(`vproattr = <string>: ${validCount}`);
        if (sample) console.log(`Sample: ${sample}`);
    } finally {
        await client.close();
    }
}

run().catch(console.error);
