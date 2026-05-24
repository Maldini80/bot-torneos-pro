import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- verified_users for discordId 1290065811494408214:');
        const user = await db.collection('verified_users').findOne({
            discordId: "1290065811494408214"
        });
        console.log(user);

        console.log('\n--- verified_users matching SweetYanira5:');
        const user2 = await db.collection('verified_users').findOne({
            $or: [
                { gameId: /SweetYanira5/i },
                { psnId: /SweetYanira5/i }
            ]
        });
        console.log(user2);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
