import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- ALL verified_users MATCHING SweetYanira:');
        console.log(await db.collection('verified_users').find({
            $or: [
                { gameId: /SweetYanira/i },
                { psnId: /SweetYanira/i }
            ]
        }).toArray());

        console.log('\n--- ALL verified_users MATCHING Satita:');
        console.log(await db.collection('verified_users').find({
            $or: [
                { gameId: /satita/i },
                { psnId: /satita/i },
                { discordId: "1264218593793413182" }
            ]
        }).toArray());
        
        console.log('\n--- ALL external_draft_registrations for Satita discordId:');
        console.log(await db.collection('external_draft_registrations').find({
            discordId: "1264218593793413182"
        }).toArray());

        console.log('\n--- ALL external_draft_registrations for SweetYanira (gameId):');
        console.log(await db.collection('external_draft_registrations').find({
            gameId: /SweetYanira/i
        }).toArray());

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
