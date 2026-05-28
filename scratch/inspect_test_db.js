import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== INSPECCIÓN DE COMPRAS (BUYOUTS) DEL 27 DE MAYO ===\n');
        
        const playerNames = ['ravenn8', 'EUREX_luvchenko', 'Juanlukaku'];
        
        const buyouts = await db.collection('fantasy_buyouts').find({
            eaPlayerName: { $in: playerNames }
        }).toArray();
        
        console.log(`Encontrados ${buyouts.length} registros de clausulazos para estos jugadores:`);
        buyouts.forEach(b => {
            console.log(`\nJugador: ${b.eaPlayerName}`);
            console.log(`- Comprador: ${b.buyerDiscordId}`);
            console.log(`- Vendedor (Team NiTrO): ${b.sellerDiscordId}`);
            console.log(`- Fecha: ${new Date(b.timestamp).toLocaleString('es-ES')}`);
            console.log(`- ¿Estaba de titular en la plantilla del vendedor? (wasStarter): ${b.wasStarter}`);
            console.log(`- ¿Procesado?: ${b.processed}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
