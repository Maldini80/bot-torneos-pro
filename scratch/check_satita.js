import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Searching verified_users for satita/SweetYanira...');
        const results = await db.collection('verified_users').find({
            $or: [
                { username: /satita/i },
                { psnId: /satita/i },
                { gameId: /satita/i },
                { psnId: /SweetYanira/i },
                { gameId: /SweetYanira/i },
                { psnId: /Satiiita03/i },
                { gameId: /Satiiita03/i }
            ]
        }).toArray();

        console.log('Results in verified_users:', JSON.stringify(results, null, 2));

        console.log('\nSearching vpg_users...');
        const vpgResults = await db.collection('vpg_users').find({
            $or: [
                { username: /satita/i },
                { eaPlayerName: /satita/i },
                { eaPlayerName: /SweetYanira/i },
                { eaPlayerName: /Satiiita03/i }
            ]
        }).toArray();
        console.log('Results in vpg_users:', JSON.stringify(vpgResults, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
