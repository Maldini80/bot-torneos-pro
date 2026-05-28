import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS = ["Adrianbr03", "eric0055k", "Manelibz4_"];

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== ANÁLISIS DE FICHAJES FANTASY PARA JUGADORES DE PEREZ FC ===\n');
        
        for (const pName of PLAYERS) {
            console.log(`Jugador: "${pName}"`);
            
            const pProfile = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            
            if (!pProfile) {
                console.log('  ❌ Sin perfil en la base de datos.');
                console.log('------------------------------------------------------------');
                continue;
            }
            
            const currentPoints = pProfile.stats?.vpgPoints || 0;
            
            // Find all teams owning this player
            const teams = await db.collection('fantasy_teams').find({
                players: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            }).toArray();
            
            console.log(`  Owned by ${teams.length} fantasy teams:`);
            
            for (const team of teams) {
                const teamName = team.teamName || team.name;
                
                // Get league
                let league = null;
                try {
                    league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
                } catch (err) {
                    league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
                }
                
                const leagueName = league ? league.name : 'Unknown League';
                const basePointsMap = league ? league.basePoints || {} : {};
                const baseValue = basePointsMap[pProfile.eaPlayerName] !== undefined ? basePointsMap[pProfile.eaPlayerName] : 0;
                
                // Check news to see when he was signed
                const news = await db.collection('fantasy_news').find({
                    $or: [
                        { eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                        { message: { $regex: new RegExp(pName, 'i') } }
                    ],
                    leagueId: String(team.leagueId)
                }).sort({ timestamp: -1 }).toArray();
                
                let signingDateStr = 'Desconocida (Sin registro de noticias)';
                let signingPriceStr = 'N/A';
                
                if (news.length > 0) {
                    const buyNews = news.find(n => 
                        n.type === 'buyout' || 
                        n.type === 'market_buy' || 
                        n.message.toLowerCase().includes('fichaje') || 
                        n.message.toLowerCase().includes('clausula') ||
                        n.message.toLowerCase().includes('compra')
                    );
                    if (buyNews) {
                        signingDateStr = new Date(buyNews.timestamp).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
                        signingPriceStr = buyNews.amount ? `${(buyNews.amount / 1000000).toFixed(2)}M` : 'Desconocido';
                    }
                }
                
                // Check delta analysis
                // Option A: Keep profile points at currentPoints (e.g. 188.2) and initialize baseline
                // Option B: Consolidate profile points to profilePoints + live VPG points (e.g. 188.2 + 36.4 = 224.6)
                let livePoints = 0;
                if (pName === 'Adrianbr03') livePoints = 36.4;
                if (pName === 'eric0055k') livePoints = 160.7;
                if (pName === 'Manelibz4_') livePoints = 12.8;
                
                const consolidatedPoints = currentPoints + livePoints;
                
                const currentNet = currentPoints - baseValue;
                const consolidatedNet = consolidatedPoints - baseValue;
                
                console.log(`    - Equipo: "${teamName}" (Liga: "${leagueName}")`);
                console.log(`      * Fecha de Fichaje: ${signingDateStr}`);
                console.log(`      * Precio de Compra: ${signingPriceStr}`);
                console.log(`      * basePoints en esta liga: ${baseValue} pts`);
                console.log(`      * Opción A (Sin Consolidar): Puntos netos hoy en la liga = ${currentNet.toFixed(1)} pts (Se queda igual)`);
                console.log(`      * Opción B (Consolidando): Puntos netos hoy en la liga = ${consolidatedNet.toFixed(1)} pts (Suma +${livePoints.toFixed(1)} pts)`);
            }
            console.log('------------------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
