import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO CLUB CON ID 2394386 ---');
        const club1 = await db.collection('club_profiles').findOne({ eaClubId: "2394386" });
        console.log(JSON.stringify(club1, null, 2));

        console.log('\n--- BUSCANDO CLUB CON NOMBRE Bachateros FC ---');
        const club2 = await db.collection('club_profiles').findOne({ eaClubName: "Bachateros FC" });
        console.log(JSON.stringify(club2, null, 2));

        console.log('\n--- BUSCANDO TODOS LOS COINCIDENTES EN club_profiles ---');
        const allClubs = await db.collection('club_profiles').find({
            $or: [
                { eaClubId: "2394386" },
                { eaClubId: "4884" },
                { eaClubName: { $regex: 'bachateros', $options: 'i' } }
            ]
        }).toArray();
        console.log(JSON.stringify(allClubs, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
