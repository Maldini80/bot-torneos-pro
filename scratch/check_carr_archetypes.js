
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function checkArchetypes() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const matches = db.collection('scanned_matches');
        
        const playersToSearch = ['Uriii-07-', 'neguix', 'princejorge', 'medrano'];
        console.log('--- BUSCANDO ARQUETIPOS DE CARRILEROS ---');

        for (const name of playersToSearch) {
            // Buscamos en el objeto anidado de jugadores (recorriendo los clubes)
            const match = await matches.findOne({
                $or: [
                    { [`players`]: { $exists: true } } // Buscamos en cualquier partido que tenga jugadores
                ]
            }, { sort: { timestamp: -1 } });

            // En lugar de una query compleja, buscamos en los últimos 200 partidos manualmente
            const recentMatches = await matches.find({}).sort({ timestamp: -1 }).limit(200).toArray();
            
            let found = false;
            for (const m of recentMatches) {
                if (!m.players) continue;
                for (const clubId in m.players) {
                    for (const pId in m.players[clubId]) {
                        const p = m.players[clubId][pId];
                        if (p.playername && p.playername.toLowerCase().includes(name.toLowerCase())) {
                            console.log(`Jugador: ${p.playername} | Arquetipo: ${p.archetypeid} | Pos: ${p.pos} | MatchId: ${m.matchId}`);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
                if (found) break;
            }
            if (!found) console.log(`Jugador ${name} no encontrado en los últimos 200 partidos.`);
        }

    } finally {
        await client.close();
    }
}

checkArchetypes();
