import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const teams = await db.collection('fantasy_teams').find({}).toArray();
        
        console.log('=== INICIANDO COMPENSACIÓN RETROACTIVA DEL 09:30 ===\n');
        
        let count = 0;
        let totalPointsComp = 0;
        let totalCoinsComp = 0;
        
        for (const t of teams) {
            const starters = {};
            const lineup = t.lineup || {};
            if (lineup.POR) starters[lineup.POR.toLowerCase()] = true;
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && (starters[p.toLowerCase()] = true));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && (starters[p.toLowerCase()] = true));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && (starters[p.toLowerCase()] = true));
            
            const numStarters = Object.keys(starters).length;
            if (numStarters < 11 && t.players && t.players.length > 0 && numStarters > 0) {
                count++;
                
                // 16.05 points per starter
                const compPoints = Math.round(numStarters * 16.05 * 10) / 10;
                const compCoins = compPoints * 80000;
                
                totalPointsComp += compPoints;
                totalCoinsComp += compCoins;
                
                // 1. Update fantasy_team points and balance
                await db.collection('fantasy_teams').updateOne(
                    { _id: t._id },
                    {
                        $inc: {
                            points: compPoints,
                            balance: compCoins
                        }
                    }
                );
                
                // 2. Insert log in fantasy_news
                const newsMsg = `💰 **COMPENSACIÓN**: El equipo **${t.teamName}** recibe **${compCoins.toLocaleString('es-ES')} €** por obtener **${compPoints}** puntos aproximados de sus ${numStarters} titulares (corrección alineación).`;
                await db.collection('fantasy_news').insertOne({
                    leagueId: t.leagueId,
                    type: 'reward',
                    message: newsMsg,
                    metadata: {
                        teamName: t.teamName,
                        discordId: t.discordId,
                        points: compPoints,
                        reward: compCoins,
                        timestamp: new Date().toISOString()
                    },
                    createdAt: new Date()
                });
                
                console.log(`[OK] ${t.teamName} (${t.discordUsername}): +${compPoints} pts, +${compCoins.toLocaleString()} € añadidos.`);
            }
        }
        
        console.log(`\n=== PROCESO COMPLETADO ===`);
        console.log(`Equipos compensados: ${count}`);
        console.log(`Total puntos acreditados: ${totalPointsComp.toFixed(1)} pts`);
        console.log(`Total dinero acreditado: ${totalCoinsComp.toLocaleString('es-ES')} €`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
