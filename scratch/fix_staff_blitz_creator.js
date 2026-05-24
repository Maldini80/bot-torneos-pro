import { connectDb, getDb } from './database.js';
import 'dotenv/config';

async function run() {
    try {
        await connectDb();
        const db = getDb();
        
        console.log('--- BUSCANDO DETALLES DE LA LIGA "STAFF BLITZ" ---');
        const league = await db.collection('fantasy_leagues').findOne({ name: /STAFF BLITZ/i });
        if (league) {
            console.log('Documento actual de la liga:', JSON.stringify(league, null, 2));
            
            // Forzar actualización del nombre del creador a "Uriii" y su discordId si es necesario (el de Uriii en IMPERIO GITANO es 136933543940718592 o similar)
            // Vamos a buscar el discordId de Uriii en la liga IMPERIO GITANO
            const imperioGitano = await db.collection('fantasy_leagues').findOne({ name: /IMPERIO GITANO/i });
            let uriiiDiscordId = league.createdBy;
            if (imperioGitano) {
                uriiiDiscordId = imperioGitano.createdBy;
                console.log(`Encontrado ID de Discord de Uriii en IMPERIO GITANO: ${uriiiDiscordId}`);
            }

            const result = await db.collection('fantasy_leagues').updateOne(
                { _id: league._id },
                { $set: { createdByUsername: 'Uriii', createdBy: uriiiDiscordId } }
            );
            
            console.log(`\n✅ ¡Éxito! Actualizada liga "STAFF BLITZ". Creador cambiado a: "Uriii" (Discord ID: ${uriiiDiscordId})`);
            
            const updatedLeague = await db.collection('fantasy_leagues').findOne({ _id: league._id });
            console.log('Documento actualizado:', JSON.stringify(updatedLeague, null, 2));
        } else {
            console.log('No se encontró ninguna liga llamada "STAFF BLITZ".');
        }
    } catch (err) {
        console.error('Error durante la corrección:', err);
    } finally {
        process.exit(0);
    }
}
run();
