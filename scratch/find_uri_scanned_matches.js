import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- ITERANDO TODOS LOS PARTIDOS ESCANEADOS ---');
        const matches = await db.collection('scanned_matches').find({}).toArray();
        console.log(`Buscando coincidencias en ${matches.length} partidos...`);

        let count = 0;
        for (const m of matches) {
            // Revisar clubA
            const clubAPlayers = m.clubA?.players || {};
            for (const pid of Object.keys(clubAPlayers)) {
                const p = clubAPlayers[pid];
                const pname = p.playername || '';
                if (pname.toLowerCase().includes('uri') || pname.toLowerCase().includes('ublaya')) {
                    console.log(`\nCoincidencia en Club A de Partido ${m.matchId}:`);
                    console.log(`Club A: ${m.clubA?.name || 'ID ' + m.clubA?.clubId}`);
                    console.log(`Club B: ${m.clubB?.name || 'ID ' + m.clubB?.clubId}`);
                    console.log(`Jugador: ${pname} (ID VPG: ${pid})`);
                    console.log(`Stats del jugador en el partido:`, JSON.stringify(p, null, 2));
                    count++;
                }
            }

            // Revisar clubB
            const clubBPlayers = m.clubB?.players || {};
            for (const pid of Object.keys(clubBPlayers)) {
                const p = clubBPlayers[pid];
                const pname = p.playername || '';
                if (pname.toLowerCase().includes('uri') || pname.toLowerCase().includes('ublaya')) {
                    console.log(`\nCoincidencia en Club B de Partido ${m.matchId}:`);
                    console.log(`Club A: ${m.clubA?.name || 'ID ' + m.clubA?.clubId}`);
                    console.log(`Club B: ${m.clubB?.name || 'ID ' + m.clubB?.clubId}`);
                    console.log(`Jugador: ${pname} (ID VPG: ${pid})`);
                    console.log(`Stats del jugador en el partido:`, JSON.stringify(p, null, 2));
                    count++;
                }
            }
        }
        console.log(`\nTotal de coincidencias encontradas en partidos: ${count}`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
