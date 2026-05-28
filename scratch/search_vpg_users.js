import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== BUSCANDO INFORMACIÓN DE TRASPASOS Y NOMBRES EXACTOS ===\n');
        
        // 1. Buscar a satitajr en las noticias de hoy
        console.log('--- Historial de satitajr hoy ---');
        const newsSatita = await db.collection('fantasy_news').find({
            message: { $regex: /satitajr/i }
        }).sort({ createdAt: -1 }).toArray();
        
        newsSatita.forEach(n => {
            console.log(`[${new Date(n.createdAt).toLocaleString('es-ES')}] [${n.type}] ${n.message}`);
        });
        console.log('----------------------------------------------------\n');
        
        // 2. Buscar a I-Maximin10 en player_profiles
        console.log('--- Perfil de I-Maximin10 ---');
        const maximin = await db.collection('player_profiles').findOne({
            eaPlayerName: { $regex: /^I-Maximin10$/i }
        });
        if (maximin) {
            console.log(`Nombre: ${maximin.eaPlayerName} | Club: ${maximin.lastClub} | Liga VPG: ${maximin.vpgLeagueSlug}`);
        } else {
            console.log('No se encontró a I-Maximin10.');
        }
        console.log('----------------------------------------------------\n');
        
        // 3. Buscar coincidencias de raven, lukaku, eurex en player_profiles
        console.log('--- Buscando raven ---');
        const ravens = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: /raven/i }
        }).toArray();
        ravens.forEach(p => console.log(`- ${p.eaPlayerName} (Club VPG: ${p.lastClub || 'N/A'}, Liga: ${p.vpgLeagueSlug})`));
        
        console.log('\n--- Buscando lukaku ---');
        const lukakus = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: /lukaku/i }
        }).toArray();
        lukakus.forEach(p => console.log(`- ${p.eaPlayerName} (Club VPG: ${p.lastClub || 'N/A'}, Liga: ${p.vpgLeagueSlug})`));
        
        console.log('\n--- Buscando eurex ---');
        const eurexs = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: /eurex/i }
        }).toArray();
        eurexs.forEach(p => console.log(`- ${p.eaPlayerName} (Club VPG: ${p.lastClub || 'N/A'}, Liga: ${p.vpgLeagueSlug})`));
        console.log('----------------------------------------------------\n');
        
        // 4. Buscar si alguno de estos jugadores fue comprado/vendido por Team NiTrO recientemente
        console.log('--- Transacciones de Team NiTrO en las últimas 24 horas ---');
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const nitroTeam = await db.collection('fantasy_teams').findOne({ teamName: { $regex: /nitro/i } });
        if (nitroTeam) {
            const nitroNews = await db.collection('fantasy_news').find({
                leagueId: nitroTeam.leagueId.toString(),
                createdAt: { $gte: oneDayAgo }
            }).sort({ createdAt: -1 }).toArray();
            
            nitroNews.forEach(n => {
                if (n.message.includes('NiTrO') || n.message.includes('nitro')) {
                    console.log(`[${new Date(n.createdAt).toLocaleString('es-ES')}] ${n.message}`);
                }
            });
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
