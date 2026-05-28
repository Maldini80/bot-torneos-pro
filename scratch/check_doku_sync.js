import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== CONFIGURACIÓN DE LIGAS Y MAPEO DE VPG ===\n');
        
        // 1. Obtener la liga JAM
        const jam = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId('6a10abe66bb40cd90498cca8') });
        console.log('--- LIGA JAM ---');
        console.log(`Nombre: ${jam.name}`);
        console.log(`pointsMode: ${jam.pointsMode}`);
        console.log(`vpgLeagueSlug:`, jam.vpgLeagueSlug);
        console.log(`vpgLeagueSlugs:`, jam.vpgLeagueSlugs);
        
        // 2. Obtener la liga Qdm
        const qdm = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId('6a1165ac92863afdcad3676f') });
        console.log('\n--- LIGA QDM ---');
        console.log(`Nombre: ${qdm.name}`);
        console.log(`pointsMode: ${qdm.pointsMode}`);
        console.log(`vpgLeagueSlug:`, qdm.vpgLeagueSlug);
        console.log(`vpgLeagueSlugs:`, qdm.vpgLeagueSlugs);
        
        // 3. Buscar si xDoku_11 está en alguna de las clasificaciones o si su club ceuta-guardians está mapeado
        console.log('\n--- CLUBS EN LA BASE DE DATOS PARA CEUTA GUARDIANS ---');
        const club = await db.collection('club_profiles').findOne({ eaClubId: { $regex: /ceuta/i } });
        // Busquemos por nombre o slug
        const clubs = await db.collection('club_profiles').find({
            $or: [
                { eaClubName: { $regex: /ceuta/i } },
                { vpgTeamSlug: 'ceuta-guardians' }
            ]
        }).toArray();
        
        if (clubs.length > 0) {
            clubs.forEach(c => {
                console.log(`Club: "${c.eaClubName}" | eaClubId: ${c.eaClubId} | vpgTeamSlug: ${c.vpgTeamSlug} | vpgLeagueSlug: ${c.vpgLeagueSlug}`);
            });
        } else {
            console.log('No se encontró el perfil de club para Ceuta Guardians.');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
