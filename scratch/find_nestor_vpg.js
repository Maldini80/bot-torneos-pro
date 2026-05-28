// scratch/find_nestor_vpg.js
import { connectDb, getDb } from '../database.js';
import fetch from 'node-fetch';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Obtener el perfil de nestor007
    const nestor = await db.collection('player_profiles').findOne({ eaPlayerName: 'nestor007' });
    console.log('--- Perfil de nestor007 ---');
    console.log(JSON.stringify(nestor, null, 2));
    
    if (nestor && nestor.lastClub) {
        console.log(`\nClub actual de nestor007: ${nestor.lastClub} (Slug: ${nestor.vpgTeamSlug})`);
        
        // Buscar si hay otros jugadores en el mismo club real de VPG en la base de datos
        const teammates = await db.collection('player_profiles').find({
            vpgTeamSlug: nestor.vpgTeamSlug
        }).toArray();
        
        console.log(`\nTeammates en la base de datos (mismo vpgTeamSlug: ${nestor.vpgTeamSlug}):`);
        for (const t of teammates) {
            console.log(`- ${t.eaPlayerName} (League: ${t.vpgLeagueSlug})`);
        }
    }
    
    // También busquemos en todos los perfiles de la DB si alguien contiene "climeent" o similar de alguna manera
    // (tal vez buscando en el campo vpgUsername, psnId, etc.)
    console.log('\n--- Buscando "clim" o "clem" en cualquier campo de player_profiles ---');
    const anyClem = await db.collection('player_profiles').find({
        $or: [
            { eaPlayerName: { $regex: /clim/i } },
            { psnId: { $regex: /clim/i } },
            { discordId: { $regex: /clim/i } },
            { vpgUsername: { $regex: /clim/i } },
            { eaPlayerName: { $regex: /clem/i } },
            { psnId: { $regex: /clem/i } },
            { discordId: { $regex: /clem/i } },
            { vpgUsername: { $regex: /clem/i } }
        ]
    }).toArray();
    
    console.log(`Encontrados en la base de datos: ${anyClem.length}`);
    for (const p of anyClem) {
        console.log(JSON.stringify(p, null, 2));
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
