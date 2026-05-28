import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const leagueId = '6a12d81f956c0f43c400ecb0';
    const escaped = 'Retromoneybeatz';

    const news = await db.collection('fantasy_news').find({
        leagueId: leagueId,
        $or: [
            { message: { $regex: new RegExp(escaped, 'i') } },
            { playerName: { $regex: new RegExp(escaped, 'i') } },
            { eaPlayerName: { $regex: new RegExp(escaped, 'i') } }
        ]
    }).toArray();

    console.log(`Noticias de Retromoneybeatz en la liga de Cadiz CFeSports (${news.length}):`);
    for (const n of news) {
        console.log(`- [${n.createdAt?.toISOString()}] ${n.message}`);
    }

    await client.close();
}

main().catch(console.error);
