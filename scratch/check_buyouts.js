import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const buyouts = await db.collection('fantasy_buyouts').find({ eaPlayerName: 'X_LeonBrothers_X' }).toArray();
    console.log('Buyouts encontrados para X_LeonBrothers_X:', JSON.stringify(buyouts, null, 2));

    await client.close();
}
main().catch(console.error);
