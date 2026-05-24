import { connectDb, getDb } from '../database.js';
import { processLeagueMarketOffers } from '../src/utils/fantasyVpgSync.js';
import { ObjectId } from 'mongodb';

async function runTest() {
    console.log("=== INICIANDO PRUEBAS DE OFERTAS AUTOMÁTICAS DE LA LIGA ===");
    
    console.log("Conectando a la base de datos...");
    await connectDb();
    const db = getDb();
    
    // Configuración de IDs de prueba
    const testLeagueId = "664b5f903798991299999999";
    const testSellerDiscordId = "test_seller_discord_id_12345";
    const testPlayerName = "Tester De La Liga";
    
    console.log("Limpiando datos previos de prueba...");
    await db.collection('player_profiles').deleteOne({ eaPlayerName: testPlayerName });
    await db.collection('fantasy_leagues').deleteOne({ _id: new ObjectId(testLeagueId) });
    await db.collection('fantasy_teams').deleteOne({ discordId: testSellerDiscordId, leagueId: testLeagueId });
    await db.collection('fantasy_market_listings').deleteMany({ leagueId: testLeagueId });
    await db.collection('fantasy_market_bids').deleteMany({ leagueId: testLeagueId });

    console.log("1. Insertando datos de prueba...");
    
    // Perfil del jugador (precio manual de 10.000.000)
    await db.collection('player_profiles').insertOne({
        eaPlayerName: testPlayerName,
        manualPrice: 10000000,
        lastPosition: 'DC',
        stats: {}
    });
    
    // Liga
    await db.collection('fantasy_leagues').insertOne({
        _id: new ObjectId(testLeagueId),
        name: "Liga Test Automatizada",
        marketOpen: true,
        maxSquadSize: 15,
        clauseMultiplier: 1.5
    });
    
    // Equipo del vendedor
    const initialBalance = 5000000;
    await db.collection('fantasy_teams').insertOne({
        leagueId: testLeagueId,
        discordId: testSellerDiscordId,
        teamName: "FC Vendedores",
        balance: initialBalance,
        players: [testPlayerName],
        lineup: {
            DC: [testPlayerName],
            MC: [],
            DFC: [],
            POR: []
        },
        clauses: {
            [testPlayerName]: 15000000
        }
    });

    console.log("2. CASO 1: Listado recién creado (menos de 2 días). No debería haber ofertas.");
    await db.collection('fantasy_market_listings').insertOne({
        leagueId: testLeagueId,
        sellerDiscordId: testSellerDiscordId,
        sellerTeamName: "FC Vendedores",
        eaPlayerName: testPlayerName,
        askingPrice: 12000000,
        createdAt: new Date() // ahora mismo
    });
    
    await processLeagueMarketOffers(db);
    
    let bids = await db.collection('fantasy_market_bids').find({ leagueId: testLeagueId }).toArray();
    if (bids.length === 0) {
        console.log("✅ Correcto: No se creó ninguna oferta para listados de menos de 2 días.");
    } else {
        throw new Error("❌ Error: Se creó una oferta prematuramente.");
    }

    console.log("3. CASO 2: Listado de 3 días (Tier 1). Debería hacer oferta por el 25% (2.500.000 €).");
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    await db.collection('fantasy_market_listings').updateOne(
        { leagueId: testLeagueId, eaPlayerName: testPlayerName },
        { $set: { createdAt: threeDaysAgo } }
    );
    
    await processLeagueMarketOffers(db);
    
    bids = await db.collection('fantasy_market_bids').find({ leagueId: testLeagueId }).toArray();
    if (bids.length === 1 && bids[0].bidderDiscordId === 'liga' && bids[0].bidAmount === 2500000 && bids[0].tier === 1) {
        console.log("✅ Correcto: Oferta de Tier 1 de La Liga creada por 2.500.000 € (25% del valor).");
    } else {
        console.log("Bids encontrados:", bids);
        throw new Error("❌ Error: La oferta de Tier 1 no se creó o el monto es incorrecto.");
    }

    console.log("4. CASO 3: Oferta rechazada por el mánager. Si sigue en Tier 1, no debe volver a cambiar a pending.");
    // Simular que el vendedor rechaza la oferta
    await db.collection('fantasy_market_bids').updateOne(
        { _id: bids[0]._id },
        { $set: { status: 'rejected' } }
    );
    
    await processLeagueMarketOffers(db);
    
    let bidAfterSecondRun = await db.collection('fantasy_market_bids').findOne({ _id: bids[0]._id });
    if (bidAfterSecondRun.status === 'rejected') {
        console.log("✅ Correcto: La oferta rechazada no se reinició porque el Tier sigue siendo el mismo.");
    } else {
        throw new Error("❌ Error: La oferta rechazada volvió a ponerse en pendiente de forma errónea.");
    }

    console.log("5. CASO 4: Pasan 5 días en total (Tier 2). Debería actualizarse al 20% (2.000.000 €) y volver a status pending.");
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await db.collection('fantasy_market_listings').updateOne(
        { leagueId: testLeagueId, eaPlayerName: testPlayerName },
        { $set: { createdAt: fiveDaysAgo } }
    );
    
    await processLeagueMarketOffers(db);
    
    let bidAfterTier2 = await db.collection('fantasy_market_bids').findOne({ _id: bids[0]._id });
    if (bidAfterTier2.bidAmount === 2000000 && bidAfterTier2.tier === 2 && bidAfterTier2.status === 'pending') {
        console.log("✅ Correcto: La oferta se actualizó al Tier 2 (2.000.000 € / 20%) y se reinició el estado a 'pending'.");
    } else {
        console.log("Bid después de Tier 2:", bidAfterTier2);
        throw new Error("❌ Error: La oferta no se actualizó correctamente al Tier 2.");
    }

    console.log("6. CASO 5: Aceptar la oferta de compra de La Liga (Simulación del endpoint).");
    
    // --- Ejecutar el flujo de La Liga Buyout ---
    const sellerTeam = await db.collection('fantasy_teams').findOne({ discordId: testSellerDiscordId, leagueId: testLeagueId });
    const sellerLineup = { ...sellerTeam.lineup };
    for (const pos in sellerLineup) {
        if (Array.isArray(sellerLineup[pos])) {
            sellerLineup[pos] = sellerLineup[pos].filter(p => p !== bidAfterTier2.eaPlayerName);
        } else if (sellerLineup[pos] === bidAfterTier2.eaPlayerName) {
            sellerLineup[pos] = null;
        }
    }

    // Aplicar actualizaciones del vendedor en fantasy_teams
    await db.collection('fantasy_teams').updateOne(
        { discordId: testSellerDiscordId, leagueId: testLeagueId },
        {
            $inc: { balance: bidAfterTier2.bidAmount },
            $pull: { players: bidAfterTier2.eaPlayerName },
            $set: { lineup: sellerLineup },
            $unset: { [`clauses.${bidAfterTier2.eaPlayerName}`]: "" }
        }
    );

    // Actualizar puja de la liga
    await db.collection('fantasy_market_bids').updateOne(
        { _id: bidAfterTier2._id },
        { $set: { status: 'accepted' } }
    );

    // Eliminar listado
    await db.collection('fantasy_market_listings').deleteOne({ leagueId: testLeagueId, eaPlayerName: bidAfterTier2.eaPlayerName });

    // Eliminar otras pujas
    await db.collection('fantasy_market_bids').deleteMany({
        leagueId: testLeagueId,
        eaPlayerName: bidAfterTier2.eaPlayerName,
        _id: { $ne: bidAfterTier2._id }
    });
    
    // --- Verificaciones finales ---
    const updatedTeam = await db.collection('fantasy_teams').findOne({ discordId: testSellerDiscordId, leagueId: testLeagueId });
    const finalListing = await db.collection('fantasy_market_listings').findOne({ leagueId: testLeagueId, eaPlayerName: testPlayerName });
    const finalBid = await db.collection('fantasy_market_bids').findOne({ _id: bidAfterTier2._id });
    
    const expectedBalance = initialBalance + bidAfterTier2.bidAmount;
    
    if (updatedTeam.balance !== expectedBalance) {
        throw new Error(`❌ Error: El balance final es incorrecto. Esperado: ${expectedBalance}, Obtenido: ${updatedTeam.balance}`);
    }
    if (updatedTeam.players.includes(testPlayerName)) {
        throw new Error("❌ Error: El jugador no fue removido del array de jugadores del vendedor.");
    }
    if (updatedTeam.lineup.DC.includes(testPlayerName)) {
        throw new Error("❌ Error: El jugador no fue removido de la alineación.");
    }
    if (updatedTeam.clauses && updatedTeam.clauses[testPlayerName] !== undefined) {
        throw new Error("❌ Error: La cláusula del jugador no fue eliminada.");
    }
    if (finalListing !== null) {
        throw new Error("❌ Error: El listado de mercado de transferibles no fue eliminado.");
    }
    if (finalBid.status !== 'accepted') {
        throw new Error(`❌ Error: El estado final de la puja no es 'accepted'. Obtenido: ${finalBid.status}`);
    }
    
    console.log("✅ Correcto: Toda la simulación del buyout de La Liga funcionó a la perfección.");

    console.log("Limpiando datos de prueba...");
    await db.collection('player_profiles').deleteOne({ eaPlayerName: testPlayerName });
    await db.collection('fantasy_leagues').deleteOne({ _id: new ObjectId(testLeagueId) });
    await db.collection('fantasy_teams').deleteOne({ discordId: testSellerDiscordId, leagueId: testLeagueId });
    await db.collection('fantasy_market_listings').deleteMany({ leagueId: testLeagueId });
    await db.collection('fantasy_market_bids').deleteMany({ leagueId: testLeagueId });
    
    console.log("=== TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO ===");
}

runTest().then(() => {
    process.exit(0);
}).catch(err => {
    console.error("❌ ERROR EN LAS PRUEBAS:", err);
    process.exit(1);
});
