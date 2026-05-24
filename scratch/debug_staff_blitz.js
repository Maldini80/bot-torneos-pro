import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const uri = process.env.DATABASE_URL;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('--- BUSCANDO DETALLES DE LA LIGA "STAFF BLITZ" ---');
        const league = await db.collection('fantasy_leagues').findOne({ name: /STAFF BLITZ/i });
        if (league) {
            console.log('Documento encontrado:', JSON.stringify(league, null, 2));
            
            // Buscar si ErChupe78 está en la colección de usuarios/teams
            const creatorTeam = await db.collection('fantasy_teams').findOne({ leagueId: league._id.toString(), discordId: league.createdBy });
            console.log('\n--- CREADOR SEGÚN ID DE DISCORD ---');
            if (creatorTeam) {
                console.log(`El ID de Discord ${league.createdBy} pertenece al equipo: "${creatorTeam.teamName}"`);
            } else {
                console.log(`No se encontró un equipo participante con discordId = ${league.createdBy} en esta liga.`);
            }
        } else {
            console.log('No se encontró ninguna liga llamada "STAFF BLITZ".');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
