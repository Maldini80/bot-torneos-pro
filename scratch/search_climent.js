// scratch/search_climent.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Buscar en player_profiles por discordId de Climent
    const climentProfile = await db.collection('player_profiles').findOne({ 
        $or: [
            { discordId: "927951096507428875" },
            { eaPlayerName: "927951096507428875" }
        ]
    });
    console.log('--- Perfil de Climent en player_profiles por Discord ID ---');
    console.log(JSON.stringify(climentProfile, null, 2));

    // Buscar en cualquier otra colección (como fantasy_teams, users, etc.) a Climent
    console.log('\n--- Buscando a Climent en fantasy_teams ---');
    const teams = await db.collection('fantasy_teams').find({
        $or: [
            { discordId: "927951096507428875" },
            { captainName: { $regex: /climent/i } },
            { teamName: { $regex: /climent/i } }
        ]
    }).toArray();
    
    for (const t of teams) {
        console.log(`- Equipo: "${t.teamName}" (Liga ID: ${t.leagueId}), CaptainName: ${t.captainName}`);
        // Ver si en la liga de este equipo está Néstor
        const nestorTeam = await db.collection('fantasy_teams').findOne({
            leagueId: t.leagueId,
            players: { $in: ["nestor007"] }
        });
        if (nestorTeam) {
            console.log(`  👉 En esta misma liga (${t.leagueId}), Néstor está en el equipo "${nestorTeam.teamName}".`);
            // Obtener el nombre de la liga
            const league = await db.collection('fantasy_leagues').findOne({ _id: t.leagueId });
            if (league) {
                console.log(`     Nombre de la liga: "${league.name}" (PointsMode: ${league.pointsMode})`);
            }
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
