import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const discordId = "1264218593793413182";
        
        console.log('--- verificationtickets for Discord ID:', discordId);
        const tickets = await db.collection('verificationtickets').find({
            $or: [
                { userId: discordId },
                { discordId: discordId }
            ]
        }).toArray();
        console.log(JSON.stringify(tickets, null, 2));

        console.log('\n--- verificationtickets for gameId /Satiiita/i or /SweetYanira/i:');
        const tickets2 = await db.collection('verificationtickets').find({
            $or: [
                { gameId: /Satiiita/i },
                { gameId: /SweetYanira/i },
                { psnId: /Satiiita/i },
                { psnId: /SweetYanira/i }
            ]
        }).toArray();
        console.log(JSON.stringify(tickets2, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
