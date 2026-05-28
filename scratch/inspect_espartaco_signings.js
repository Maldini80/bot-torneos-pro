import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== INVESTIGACIÓN DE SIGNINGS PARA ESPARTAC0_87 ===\n');
        
        const p = await db.collection('player_profiles').findOne({ 
            eaPlayerName: { $regex: new RegExp('^Espartac0_87$', 'i') } 
        });
        const currentPoints = p.stats?.vpgPoints || 0;
        const correctedPoints = 246.0;
        
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^Espartac0_87$', 'i') }
        }).toArray();
        
        console.log(`Espartaco está en el roster de ${teams.length} equipos fantasy:\n`);
        
        for (const team of teams) {
            // Find league (try both ObjectId and string)
            let league = null;
            try {
                league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
            } catch (err) {
                league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
            }
            
            const leagueName = league ? league.name : 'Unknown League';
            const leagueMode = league ? league.pointsMode : 'N/A';
            const teamName = team.name || team.teamName || 'Sin Nombre';
            
            // Check base points in league
            const basePointsMap = league?.basePoints || {};
            const basePointsKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === 'espartac0_87');
            const basePointsVal = basePointsKey !== undefined ? basePointsMap[basePointsKey] : 0;
            
            // Check if he is in the active lineup
            let inLineup = false;
            const lineup = team.lineup || {};
            if (lineup.POR && lineup.POR.toLowerCase() === 'espartac0_87') inLineup = true;
            if (Array.isArray(lineup.DFC) && lineup.DFC.some(name => name && name.toLowerCase() === 'espartac0_87')) inLineup = true;
            if (Array.isArray(lineup.MC) && lineup.MC.some(name => name && name.toLowerCase() === 'espartac0_87')) inLineup = true;
            if (Array.isArray(lineup.DC) && lineup.DC.some(name => name && name.toLowerCase() === 'espartac0_87')) inLineup = true;
            
            // Query news
            const news = await db.collection('fantasy_news').find({
                $or: [
                    { eaPlayerName: { $regex: new RegExp('^Espartac0_87$', 'i') } },
                    { message: { $regex: new RegExp('Espartac0_87', 'i') } }
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
            
            const currentNet = currentPoints - basePointsVal;
            const correctedNet = correctedPoints - basePointsVal;
            const diffPoints = correctedPoints - currentPoints; // +13.7
            
            console.log(`Equipo Fantasy: "${teamName}" (Mánager: <@${team.ownerDiscordId || 'N/A'}>)`);
            console.log(`  - Liga Fantasy: "${leagueName}" (ID: ${team.leagueId})`);
            console.log(`  - Modo de Puntos: ${leagueMode}`);
            console.log(`  - ¿En Alineación Titular?: ${inLineup ? 'SÍ' : 'NO'}`);
            console.log(`  - Fecha de Fichaje: ${signingDateStr}`);
            console.log(`  - Precio de Compra: ${signingPriceStr}`);
            console.log(`  - basePoints en esta liga: ${basePointsVal} pts`);
            console.log(`  - Puntos netos actuales en esta liga: ${currentNet.toFixed(1)} pts`);
            console.log(`  - Nuevos puntos netos tras corregir: ${correctedNet.toFixed(1)} pts (Suma +${diffPoints.toFixed(1)} pts)`);
            console.log('------------------------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
