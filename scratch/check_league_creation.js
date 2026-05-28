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
        
        console.log('=== FECHA DE CREACIÓN DE LA LIGA CADIZ UNITED ===\n');
        
        // Find league
        const leagueId = '6a161ece04fa34c06b9ba7dd';
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
        
        if (!league) {
            console.log('No se encontró la liga.');
            return;
        }
        
        console.log('Nombre de la Liga:', league.name);
        console.log('ID de la Liga:', league._id.toString());
        
        // Extract timestamp from ObjectId
        const creationTimeFromId = new ObjectId(leagueId).getTimestamp();
        console.log('Fecha de creación (desde ObjectId):', creationTimeFromId.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));
        
        if (league.createdAt) {
            console.log('Fecha de creación (createdAt field):', new Date(league.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));
        }
        
        // Let\'s also check when the first team joined
        const firstTeam = await db.collection('fantasy_teams').findOne({ leagueId: leagueId }, { sort: { joinedAt: 1 } });
        if (firstTeam) {
            console.log('Primer equipo unido:', firstTeam.teamName || firstTeam.name);
            console.log('Fecha de ingreso del primer equipo:', new Date(firstTeam.joinedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
