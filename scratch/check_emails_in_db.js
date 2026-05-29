import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const defaultDb = getDb();
    const testDb = getDb('test');

    const collectionsToCheck = [
        { db: defaultDb, name: 'verified_users' },
        { db: defaultDb, name: 'verificationtickets' },
        { db: defaultDb, name: 'sessions' },
        { db: testDb, name: 'vpg_users' },
        { db: testDb, name: 'tickets' },
        { db: testDb, name: 'playerapplications' }
    ];

    console.log('=== Checking for Email fields in User Collections ===');
    for (const item of collectionsToCheck) {
        const sample = await item.db.collection(item.name).findOne({
            $or: [
                { email: { $exists: true } },
                { mail: { $exists: true } },
                { correo: { $exists: true } }
            ]
        });
        if (sample) {
            console.log(`- Collection ${item.name} has documents with email fields! Fields present:`, Object.keys(sample));
        } else {
            console.log(`- Collection ${item.name}: No documents contain 'email', 'mail', or 'correo'.`);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
