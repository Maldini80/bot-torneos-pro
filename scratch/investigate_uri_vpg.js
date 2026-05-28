import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- DOCUMENTO DE ublaya777 ---');
        const ublaya = await db.collection('player_profiles').findOne({ eaPlayerName: 'ublaya777' });
        console.log(JSON.stringify(ublaya, null, 2));

        console.log('\n--- DOCUMENTO DE Uriii-07- ---');
        const uriii = await db.collection('player_profiles').findOne({ eaPlayerName: 'Uriii-07-' });
        console.log(JSON.stringify(uriii, null, 2));

        console.log('\n--- OTROS JUGADORES CON ublaya EN EL NOMBRE ---');
        const othersUblaya = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: 'ublaya', $options: 'i' }
        }).toArray();
        console.log(JSON.stringify(othersUblaya, null, 2));

        console.log('\n--- BUSCAR SI ublaya777 Y Uriii-07- TIENEN EL MISMO discordId O ALGO EN COMÚN ---');
        // A veces se vinculan al mismo perfil de Discord, veamos si hay campos compartidos
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
