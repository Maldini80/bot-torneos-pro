import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const count = await db.collection('player_profiles').countDocuments();
        console.log(`Total player profiles: ${count}`);

        const withAvatar = await db.collection('player_profiles').countDocuments({ avatar: { $ne: null } });
        console.log(`Players with avatar: ${withAvatar}`);

        const sample = await db.collection('player_profiles').find({ avatar: { $ne: null } }).limit(5).toArray();
        console.log("Sample avatars:");
        sample.forEach(p => {
            console.log(`- ${p.eaPlayerName}: ${p.avatar}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
main();
