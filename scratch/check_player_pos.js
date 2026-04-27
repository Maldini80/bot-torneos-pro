import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function checkPlayerPos() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const matches = db.collection('scanned_matches');

        const playersToSearch = ['joselitoRJ7', 'joselito'];
        console.log('--- BUSCANDO POSICIÓN Y ARQUETIPO ---\n');

        const recentMatches = await matches.find({}).sort({ timestamp: -1 }).limit(300).toArray();
        
        for (const name of playersToSearch) {
            let count = 0;
            for (const m of recentMatches) {
                if (!m.players) continue;
                for (const clubId in m.players) {
                    for (const pId in m.players[clubId]) {
                        const p = m.players[clubId][pId];
                        if (p.playername && p.playername.toLowerCase().includes(name.toLowerCase())) {
                            const matchDate = new Date(parseInt(m.timestamp) * 1000);
                            const madridTime = matchDate.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
                            console.log(`Jugador: ${p.playername} | pos: ${p.pos} | archetypeid: ${p.archetypeid} | rating: ${p.rating} | Fecha: ${madridTime} | MatchId: ${m.matchId}`);
                            // Print ALL keys of the player object to see what EA returns
                            if (count === 0) {
                                console.log(`  -> Todas las keys del jugador: ${Object.keys(p).join(', ')}`);
                            }
                            count++;
                            if (count >= 5) break;
                        }
                    }
                    if (count >= 5) break;
                }
                if (count >= 5) break;
            }
            if (count === 0) console.log(`Jugador "${name}" no encontrado en los últimos 300 partidos.`);
            console.log('');
        }

    } finally {
        await client.close();
    }
}

checkPlayerPos();
