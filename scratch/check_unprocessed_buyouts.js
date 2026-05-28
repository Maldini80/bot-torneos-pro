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
        
        console.log('=== CLAUSULAZOS PENDIENTES DE PROCESAR (PROCESSED: FALSE) ===\n');
        
        const buyouts = await db.collection('fantasy_buyouts').find({ processed: false }).toArray();
        console.log(`Encontrados ${buyouts.length} clausulazos pendientes:\n`);
        
        for (const b of buyouts) {
            let leagueName = 'Liga Desconocida';
            try {
                const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(b.leagueId) });
                if (league) leagueName = league.name;
            } catch (err) {
                const league = await db.collection('fantasy_leagues').findOne({ _id: b.leagueId });
                if (league) leagueName = league.name;
            }
            
            console.log(`Jugador: "${b.eaPlayerName}"`);
            console.log(`  - Liga Fantasy: "${leagueName}" (ID: ${b.leagueId})`);
            console.log(`  - Comprador (Discord ID): <@${b.buyerDiscordId}>`);
            console.log(`  - Vendedor (Discord ID): <@${b.sellerDiscordId}>`);
            console.log(`  - Importe de la Cláusula: ${(b.amount / 1000000).toFixed(2)}M`);
            console.log(`  - Fecha/Hora: ${new Date(b.timestamp).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
            console.log('------------------------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
