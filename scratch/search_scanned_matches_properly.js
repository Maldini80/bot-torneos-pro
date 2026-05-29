import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');

        const allMatches = await db.collection('scanned_matches').find({}).toArray();
        const appearances = [];

        for (const m of allMatches) {
            if (m.players && m.players['5549']) {
                const clubPlayers = m.players['5549'];
                for (const playerId of Object.keys(clubPlayers)) {
                    const player = clubPlayers[playerId];
                    const playerName = player.playername || player.playerName || '';
                    if (playerName.toLowerCase().includes('pandax')) {
                        const clubKeys = Object.keys(m.clubs || {});
                        const oppId = clubKeys.find(k => k !== '5549');
                        const oppClub = m.clubs[oppId] || {};
                        const gkClub = m.clubs['5549'] || {};
                        
                        appearances.push({
                            matchId: m.matchId,
                            timestamp: parseInt(m.timestamp),
                            date: new Date(parseInt(m.timestamp) * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
                            opponentName: oppClub.details?.name || oppId || 'Rival Desconocido',
                            gkGoals: parseInt(gkClub.goals || 0),
                            oppGoals: parseInt(oppClub.goals || 0),
                            rating: parseFloat(player.rating || 0),
                            pos: player.pos || 'Desconocido',
                            goals: parseInt(player.goals || 0),
                            assists: parseInt(player.assists || 0)
                        });
                    }
                }
            }
        }

        // Sort descending by timestamp
        appearances.sort((a, b) => b.timestamp - a.timestamp);

        console.log(`=== ALL ${appearances.length} MATCHES DISPUTED FOR GOLDEN KNIGHTS ===`);
        appearances.forEach((app, idx) => {
            console.log(`${idx + 1}. [${app.date}] Golden Knights ${app.gkGoals} - ${app.oppGoals} ${app.opponentName} | Pos: ${app.pos} | Rating: ${app.rating} | G: ${app.goals} | A: ${app.assists}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
