import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== INSPECCIÓN DE FANTASY CONFIG Y VPG STANDINGS ===\n');
        
        // 1. Obtener active_leagues
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        console.log('Ligas activas en fantasy_config:');
        console.log(JSON.stringify(config, null, 2));
        
        // 2. Buscar si el equipo de VPG "Ceuta Guardians" o "ceuta-guardians" existe en la colección de equipos mapeados de la DB
        console.log('\nEquipos de la DB (colección "teams" de la DB de torneos "test") con slug ceuta-guardians:');
        const testDb = client.db('test'); // La base de datos de torneos
        const teams = await testDb.collection('teams').find({
            $or: [
                { vpgTeamSlug: 'ceuta-guardians' },
                { name: { $regex: /ceuta/i } }
            ]
        }).toArray();
        
        if (teams.length > 0) {
            teams.forEach(t => {
                console.log(`- Nombre: "${t.name}" | vpgTeamSlug: "${t.vpgTeamSlug}" | vpgLeagueSlug: "${t.vpgLeagueSlug}" | eaClubId: ${t.eaClubId}`);
            });
        } else {
            console.log('❌ No se encontró ningún equipo en la DB "test.teams" para Ceuta Guardians.');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
