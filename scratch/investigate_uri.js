import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO JUGADORES EN EL CLUB "Bachateros FC" ---');
        const players = await db.collection('player_profiles').find({
            $or: [
                { lastClub: { $regex: 'bachateros', $options: 'i' } },
                { vpgTeamSlug: { $regex: 'bachateros', $options: 'i' } }
            ]
        }).toArray();
        console.log(`Encontrados ${players.length} jugadores:`);
        for (const p of players) {
            console.log(`Jugador: ${p.eaPlayerName} | Club: ${p.lastClub} | Liga: ${p.vpgLeagueSlug} | VPG Username: ${p.vpgProfile?.username}`);
        }

        console.log('\n--- BUSCANDO COINCIDENCIAS DE "ublaya" O "uri" EN VPG PROFILES ---');
        const vpgProfiles = await db.collection('player_profiles').find({
            $or: [
                { "vpgProfile.username": { $regex: 'ublaya', $options: 'i' } },
                { "vpgProfile.username": { $regex: 'uri', $options: 'i' } }
            ]
        }).toArray();
        console.log(`Encontrados ${vpgProfiles.length} perfiles VPG:`);
        for (const p of vpgProfiles) {
            console.log(`Jugador: ${p.eaPlayerName} | Club: ${p.lastClub} | VPG Username: ${p.vpgProfile?.username}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
