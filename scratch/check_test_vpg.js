import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        
        console.log('--- test.vpg_users by discordId 1264218593793413182:');
        const user = await testDb.collection('vpg_users').find({
            $or: [
                { discordId: "1264218593793413182" },
                { discordID: "1264218593793413182" }
            ]
        }).toArray();
        console.log(user);

        console.log('\n--- test.vpg_users by eaPlayerName/psn/username matching satita:');
        const user2 = await testDb.collection('vpg_users').find({
            $or: [
                { username: /satita/i },
                { eaPlayerName: /satita/i },
                { psnId: /satita/i }
            ]
        }).toArray();
        console.log(user2);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
