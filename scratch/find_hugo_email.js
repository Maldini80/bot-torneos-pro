import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const defaultDb = getDb();
    const testDb = getDb('test');

    const searchStr = "Hugo_Xx10xX";
    const regex = new RegExp(searchStr, "i");

    console.log(`=== Searching for ${searchStr} contacts and emails ===`);

    // Search in vpg_users (testDb)
    const vpgUsers = await testDb.collection('vpg_users').find({
        $or: [
            { username: regex },
            { eaPlayerName: regex },
            { psn: regex },
            { email: regex }
        ]
    }).toArray();
    console.log(`vpg_users matches:`, JSON.stringify(vpgUsers, null, 2));

    // Search in verified_users (defaultDb & testDb)
    const verifiedDefault = await defaultDb.collection('verified_users').find({
        $or: [
            { eaPlayerName: regex },
            { psn: regex },
            { discordId: regex },
            { email: regex }
        ]
    }).toArray();
    console.log(`verified_users (defaultDb) matches:`, JSON.stringify(verifiedDefault, null, 2));

    const verifiedTest = await testDb.collection('verified_users').find({
        $or: [
            { eaPlayerName: regex },
            { psn: regex },
            { discordId: regex },
            { email: regex }
        ]
    }).toArray();
    console.log(`verified_users (testDb) matches:`, JSON.stringify(verifiedTest, null, 2));

    // Search in playerapplications (testDb)
    const apps = await testDb.collection('playerapplications').find({
        $or: [
            { eaPlayerName: regex },
            { discordName: regex },
            { discordId: regex }
        ]
    }).toArray();
    console.log(`playerapplications matches:`, JSON.stringify(apps, null, 2));

    // Let's also do a general search in tickets or verificationtickets
    const verificationTickets = await defaultDb.collection('verificationtickets').find({
        $or: [
            { eaPlayerName: regex },
            { discordId: regex }
        ]
    }).toArray();
    console.log(`verificationtickets matches:`, JSON.stringify(verificationTickets, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
