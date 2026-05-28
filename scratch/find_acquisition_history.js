import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

const AFFECTED = [
    { name: 'Retromoneybeatz', inflatedPts: 467, realPts: 233.5, extraPts: 233.5 },
    { name: 'nestor007', inflatedPts: 209.4, realPts: 104.7, extraPts: 104.7 },
    { name: 'xDiiego10#6089', inflatedPts: 514.9, realPts: 268.1, extraPts: 246.8 },
    { name: '13alvaro12', inflatedPts: 291.8, realPts: 145.9, extraPts: 145.9 },
    { name: 'FrancM2P8', inflatedPts: 225, realPts: 120.5, extraPts: 104.5 },
    { name: 'zzRaydenzz', inflatedPts: 127.5, realPts: 92.2, extraPts: 35.3 },
    { name: 'not_ven00m', inflatedPts: 194.2, realPts: 97.1, extraPts: 97.1 },
];

function isPlayerInLineup(lineup, playerName) {
    if (!lineup || !playerName) return false;
    const nameLower = playerName.toLowerCase();
    if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
    for (const pos of ['DFC', 'MC', 'DC', 'CARR']) {
        if (Array.isArray(lineup[pos]) && lineup[pos].some(p => p && p.toLowerCase() === nameLower)) return true;
    }
    return false;
}

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    console.log('=== BÚSQUEDA DE HISTORIAL DE ADQUISICIONES ===\n');
    
    // 1. Primero, veamos qué tipos de noticias hay en fantasy_news
    const newsTypes = await db.collection('fantasy_news').distinct('type');
    console.log('Tipos de noticias disponibles:', newsTypes);
    
    // 2. Buscar cuántas noticias hay en total
    const totalNews = await db.collection('fantasy_news').countDocuments();
    console.log(`Total de noticias: ${totalNews}\n`);
    
    // 3. Buscar un ejemplo de cada tipo
    for (const type of newsTypes) {
        const example = await db.collection('fantasy_news').findOne({ type });
        console.log(`\nEjemplo de tipo "${type}":`);
        console.log(JSON.stringify(example, null, 2));
    }
    
    // 4. Para cada jugador afectado, buscar TODAS las noticias relacionadas
    console.log('\n\n=== NOTICIAS POR JUGADOR AFECTADO ===');
    for (const player of AFFECTED) {
        const escaped = player.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const news = await db.collection('fantasy_news').find({
            $or: [
                { message: { $regex: new RegExp(escaped, 'i') } },
                { playerName: { $regex: new RegExp(escaped, 'i') } },
                { eaPlayerName: { $regex: new RegExp(escaped, 'i') } },
                { details: { $regex: new RegExp(escaped, 'i') } }
            ]
        }).sort({ timestamp: 1 }).toArray();
        
        console.log(`\n--- ${player.name} (${news.length} noticias) ---`);
        for (const n of news) {
            const ts = n.timestamp ? new Date(n.timestamp).toISOString().slice(0, 16) : 'N/A';
            const leagueId = n.leagueId || 'N/A';
            console.log(`  [${ts}] ${n.type}: ${n.message || ''} (liga: ${leagueId})`);
        }
    }
    
    // 5. Buscar también en fantasy_market_bids y fantasy_buyouts
    console.log('\n\n=== HISTORIAL DE COMPRAS (market_bids aceptadas) ===');
    for (const player of AFFECTED) {
        const escaped = player.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const bids = await db.collection('fantasy_market_bids').find({
            eaPlayerName: { $regex: new RegExp('^' + escaped + '$', 'i') },
            status: 'accepted'
        }).sort({ timestamp: 1 }).toArray();
        
        if (bids.length > 0) {
            console.log(`\n--- ${player.name} ---`);
            for (const b of bids) {
                const ts = b.timestamp ? new Date(b.timestamp).toISOString().slice(0, 16) : (b.acceptedAt ? new Date(b.acceptedAt).toISOString().slice(0, 16) : 'N/A');
                console.log(`  [${ts}] Liga: ${b.leagueId} | Comprador: ${b.bidderDiscordId} | Precio: ${b.bidAmount}`);
            }
        }
    }
    
    // 6. Buscar en fantasy_buyouts (clausulazos)
    console.log('\n\n=== HISTORIAL DE CLAUSULAZOS ===');
    for (const player of AFFECTED) {
        const escaped = player.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const buyouts = await db.collection('fantasy_buyouts').find({
            eaPlayerName: { $regex: new RegExp('^' + escaped + '$', 'i') }
        }).sort({ timestamp: 1 }).toArray();
        
        if (buyouts.length > 0) {
            console.log(`\n--- ${player.name} ---`);
            for (const b of buyouts) {
                const ts = b.timestamp ? new Date(b.timestamp).toISOString().slice(0, 16) : 'N/A';
                console.log(`  [${ts}] Liga: ${b.leagueId} | Comprador: ${b.buyerDiscordId} | Vendedor: ${b.sellerDiscordId} | Precio: ${b.clausePrice} | Procesado: ${b.processed}`);
            }
        }
    }
    
    // 7. Ver cuándo se registraron las ligas y equipos (joinedAt)
    console.log('\n\n=== FECHAS DE REGISTRO DE EQUIPOS CON JUGADORES AFECTADOS ===');
    for (const player of AFFECTED) {
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp(player.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
        }).toArray();
        
        console.log(`\n--- ${player.name} ---`);
        for (const team of teams) {
            let league = null;
            try { league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) }); } catch(e) {}
            const leagueName = league ? league.name : 'Desconocida';
            const joinedAt = team.joinedAt ? new Date(team.joinedAt).toISOString().slice(0, 16) : 'N/A';
            const inLineup = isPlayerInLineup(team.lineup, player.name);
            console.log(`  Liga: ${leagueName} | Equipo: ${team.teamName} | Unido: ${joinedAt} | En once: ${inLineup ? 'SÍ' : 'NO'} | Pts: ${team.points}`);
        }
    }
    
    // 8. Ver historial de syncs de puntos (cuántos ha habido)
    console.log('\n\n=== HISTORIAL DE SYNCS DE PUNTOS ===');
    const pointSyncNews = await db.collection('fantasy_news').find({
        $or: [
            { type: 'points_sync' },
            { type: 'sync' },
            { type: { $regex: /sync|puntos|points/i } },
            { message: { $regex: /sync|puntos|actualiz/i } }
        ]
    }).sort({ timestamp: -1 }).limit(20).toArray();
    
    console.log(`Últimos ${pointSyncNews.length} registros de sync:`);
    for (const n of pointSyncNews) {
        const ts = n.timestamp ? new Date(n.timestamp).toISOString().slice(0, 16) : 'N/A';
        console.log(`  [${ts}] ${n.type}: ${(n.message || '').substring(0, 100)}`);
    }
    
    await client.close();
}

main().catch(console.error);
