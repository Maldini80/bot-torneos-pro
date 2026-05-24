import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        
        const vpgUsersColl = testDb.collection('vpg_users');
        const vpgUsersCount = await vpgUsersColl.countDocuments();
        console.log('Total vpg_users:', vpgUsersCount);
        if (vpgUsersCount > 0) {
            const samples = await vpgUsersColl.find().limit(3).toArray();
            console.log('Sample vpg_users:', JSON.stringify(samples, null, 2));
        }

        const verifiedUsersColl = testDb.collection('verified_users');
        const verifiedUsersCount = await verifiedUsersColl.countDocuments();
        console.log('Total verified_users:', verifiedUsersCount);
        if (verifiedUsersCount > 0) {
            const samples = await verifiedUsersColl.find().limit(3).toArray();
            console.log('Sample verified_users:', JSON.stringify(samples, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
test();
