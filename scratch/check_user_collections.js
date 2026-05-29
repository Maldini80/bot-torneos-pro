import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const defaultDb = getDb();
    const testDb = getDb('test');

    console.log('=== Checking Collections Sizes ===');
    console.log('defaultDb.verified_users count:', await defaultDb.collection('verified_users').countDocuments());
    console.log('testDb.verified_users count:', await testDb.collection('verified_users').countDocuments());
    console.log('testDb.vpg_users count:', await testDb.collection('vpg_users').countDocuments());
    console.log('testDb.playerapplications count:', await testDb.collection('playerapplications').countDocuments());
    console.log('defaultDb.verificationtickets count:', await defaultDb.collection('verificationtickets').countDocuments());

    console.log('\n=== Checking if any document has "Hugo" in testDb.vpg_users ===');
    const hugoVpgUsers = await testDb.collection('vpg_users').find({
        $or: [
            { username: /hugo/i },
            { eaPlayerName: /hugo/i },
            { psn: /hugo/i }
        ]
    }).toArray();
    console.log(`Found ${hugoVpgUsers.length} in vpg_users matching "hugo":`);
    console.log(JSON.stringify(hugoVpgUsers, null, 2));

    console.log('\n=== Checking if any document has "Hugo" in defaultDb.verified_users ===');
    const hugoVerified = await defaultDb.collection('verified_users').find({
        $or: [
            { username: /hugo/i },
            { eaPlayerName: /hugo/i },
            { psn: /hugo/i },
            { discordName: /hugo/i }
        ]
    }).toArray();
    console.log(`Found ${hugoVerified.length} in defaultDb.verified_users matching "hugo":`);
    console.log(JSON.stringify(hugoVerified, null, 2));

    console.log('\n=== Sample document from testDb.vpg_users ===');
    const sampleVpgUser = await testDb.collection('vpg_users').findOne();
    console.log(sampleVpgUser);

    console.log('\n=== Sample document from defaultDb.verified_users ===');
    const sampleVerified = await defaultDb.collection('verified_users').findOne();
    console.log(sampleVerified);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
