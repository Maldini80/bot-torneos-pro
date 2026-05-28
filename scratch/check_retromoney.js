import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    // 1. Buscar perfil del jugador
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /retromone/i }
    });
    
    if (!player) {
        console.log('Jugador no encontrado');
        await client.close();
        return;
    }
    
    console.log('=== PERFIL DEL JUGADOR ===');
    console.log('Nombre:', player.eaPlayerName);
    console.log('Posición:', player.lastPosition || player.manualPosition);
    console.log('Club:', player.lastClub);
    console.log('Liga VPG:', player.vpgLeagueSlug);
    console.log('Team Slug VPG:', player.vpgTeamSlug);
    console.log('Precio manual:', player.manualPrice);
    console.log('Excluido:', player.excluded);
    
    console.log('\n=== STATS ===');
    const stats = player.stats || {};
    console.log('Partidos jugados:', stats.matchesPlayed);
    console.log('Goles:', stats.goals);
    console.log('Asistencias:', stats.assists);
    console.log('Clean sheets:', stats.cleanSheets);
    console.log('Victorias:', stats.wins);
    console.log('Derrotas:', stats.losses);
    console.log('Empates:', stats.ties);
    console.log('Puntos VPG:', stats.vpgPoints);
    console.log('Ratings:', stats.ratings);
    console.log('Tarjetas rojas:', stats.redCards);
    console.log('Tarjetas amarillas:', stats.yellowCards);
    console.log('Disparos:', stats.shots);
    console.log('Paradas:', stats.saves);
    
    // Calcular precio dinámico
    const posUpper = (player.manualPosition || player.lastPosition || '').toUpperCase();
    const isGk = posUpper === 'POR' || posUpper === 'GK';
    let price = 1000000;
    price += (stats.goals || 0) * 250000;
    price += (stats.assists || 0) * 200000;
    const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR', 'GK'].includes(posUpper);
    if (isDefOrGk) price += (stats.cleanSheets || 0) * 150000;
    price += (stats.wins || 0) * 50000;
    price -= (stats.losses || 0) * 25000;
    
    let avgRating = 6.0;
    const matchesPlayed = stats.matchesPlayed || 0;
    if (matchesPlayed > 0 && Array.isArray(stats.ratings) && stats.ratings.length > 0) {
        const sum = stats.ratings.reduce((acc, r) => acc + (parseFloat(r) || 0), 0);
        avgRating = sum / matchesPlayed;
    }
    
    console.log('\n=== CÁLCULO DE PRECIO ===');
    console.log('Avg Rating:', avgRating.toFixed(4));
    console.log('Precio base (antes de rating):', price);
    
    if (avgRating > 6.0) price *= (1 + (avgRating - 6.0) * 0.5);
    console.log('Precio después de rating:', Math.round(price));
    
    if (isGk) {
        price *= 2;
        console.log('Precio después de x2 portero:', Math.round(price));
    }
    
    price *= 5.33333333;
    console.log('Precio después de x5.33:', Math.round(price));
    
    // Multiplicador por división
    const slug = (player.vpgLeagueSlug || '').toLowerCase().trim();
    let divMult = 1.0;
    if (slug === 'superliga-spain-a' || slug === 'superliga-spain-b') divMult = 1.0;
    else if (slug.includes('segunda')) divMult = 0.75;
    else if (slug.includes('tercera')) divMult = 0.55;
    else if (slug.includes('cuarta')) divMult = 0.40;
    else if (slug.includes('quinta')) divMult = 0.30;
    
    price *= divMult;
    console.log('División multiplicador:', divMult);
    console.log('Precio después de división:', Math.round(price));
    
    // Límites
    const minPrice = 2600000 * divMult;
    price = Math.min(80000000, Math.max(minPrice, price));
    price = Math.round(price / 50000) * 50000;
    console.log('Precio final (con límites y redondeo):', price);
    console.log('Precio en M:', (price / 1000000).toFixed(1) + 'M');
    
    // 2. Buscar en qué equipos de Fantasy está
    const teams = await db.collection('fantasy_teams').find({
        players: { $regex: /retromone/i }
    }).toArray();
    
    console.log('\n=== EQUIPOS FANTASY QUE LO TIENEN ===');
    for (const team of teams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
        const leagueName = league ? league.name : 'Desconocida';
        
        // Check if in lineup
        const lineup = team.lineup || {};
        let inLineup = false;
        let lineupPos = '';
        const name = player.eaPlayerName.toLowerCase();
        if (lineup.POR && lineup.POR.toLowerCase() === name) { inLineup = true; lineupPos = 'POR'; }
        if (Array.isArray(lineup.DFC) && lineup.DFC.some(p => p && p.toLowerCase() === name)) { inLineup = true; lineupPos = 'DFC'; }
        if (Array.isArray(lineup.MC) && lineup.MC.some(p => p && p.toLowerCase() === name)) { inLineup = true; lineupPos = 'MC'; }
        if (Array.isArray(lineup.DC) && lineup.DC.some(p => p && p.toLowerCase() === name)) { inLineup = true; lineupPos = 'DC'; }
        
        const clause = team.clauses ? team.clauses[player.eaPlayerName] : undefined;
        
        console.log(`  Liga: ${leagueName} | Equipo: ${team.teamName} | En once: ${inLineup ? 'SÍ (' + lineupPos + ')' : 'NO'} | Cláusula: ${clause || 'N/A'}`);
    }
    
    // 3. Buscar noticias recientes de este jugador
    const news = await db.collection('fantasy_news').find({
        $or: [
            { message: { $regex: /retromone/i } },
            { details: { $regex: /retromone/i } }
        ]
    }).sort({ timestamp: -1 }).limit(10).toArray();
    
    console.log('\n=== NOTICIAS RECIENTES ===');
    for (const n of news) {
        console.log(`  [${new Date(n.timestamp).toISOString()}] ${n.type}: ${n.message}`);
    }
    
    // 4. Buscar clausulazos sobre este jugador
    const buyouts = await db.collection('fantasy_buyouts').find({
        eaPlayerName: { $regex: /retromone/i }
    }).sort({ timestamp: -1 }).toArray();
    
    console.log('\n=== CLAUSULAZOS ===');
    for (const b of buyouts) {
        console.log(`  [${new Date(b.timestamp).toISOString()}] Liga: ${b.leagueId} | Comprador: ${b.buyerDiscordId} | Vendedor: ${b.sellerDiscordId} | Precio: ${b.clausePrice} | Procesado: ${b.processed}`);
    }
    
    // 5. Verificar vpgLastRaw
    console.log('\n=== VPG LAST RAW ===');
    console.log(JSON.stringify(stats.vpgLastRaw, null, 2));
    
    await client.close();
}

main().catch(console.error);
