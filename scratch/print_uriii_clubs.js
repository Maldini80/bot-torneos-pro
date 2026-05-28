import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const matches = await db.collection('scanned_matches').find({}).toArray();
        console.log('--- BUSCANDO CLUBES DE Uriii-07- EN PARTIDOS ---');
        
        for (const m of matches) {
            const mStr = JSON.stringify(m).toLowerCase();
            if (mStr.includes('uriii-07-')) {
                // Encontrar en qué club de este partido jugó Uriii-07-
                let foundClubId = null;
                let foundClubName = null;
                
                const clubs = m.clubs || {};
                for (const cid of Object.keys(clubs)) {
                    const cInfo = clubs[cid];
                    const players = cInfo.players || {};
                    for (const pid of Object.keys(players)) {
                        const p = players[pid];
                        if (p.playername?.toLowerCase() === 'uriii-07-') {
                            foundClubId = cid;
                            foundClubName = cInfo.details?.name || cInfo.name;
                            break;
                        }
                    }
                    if (foundClubId) break;
                }
                
                console.log(`Match ID: ${m.matchId} | Fecha: ${m.timestamp ? new Date(parseInt(m.timestamp)*1000) : 'N/A'} | Club ID Encontrado: ${foundClubId} (${foundClubName})`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
