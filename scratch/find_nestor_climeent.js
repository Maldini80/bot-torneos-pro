// scratch/find_nestor_climeent.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Listando TODAS las ligas en fantasy_leagues ---');
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    console.log(`Encontradas ${leagues.length} ligas en total.`);
    
    for (const league of leagues) {
        console.log(`- Liga: "${league.name}" (ID: ${league._id}), Active: ${league.active}, PointsMode: ${league.pointsMode}`);
        
        const teams = await db.collection('fantasy_teams').find({ 
            leagueId: league._id.toString() 
        }).toArray();
        
        console.log(`  Equipos: ${teams.length}`);
        
        let nestorTeam = null;
        let climeentTeam = null;
        
        for (const team of teams) {
            const players = team.players || [];
            // Comparación insensible y flexible
            const hasNestor = players.some(p => p.toLowerCase().includes('nestor') || p.toLowerCase().includes('nēstor') || p.toLowerCase().includes('néstor'));
            const hasClimeent = players.some(p => p.toLowerCase().includes('climeent') || p.toLowerCase().includes('clement') || p.toLowerCase().includes('clim'));
            
            if (hasNestor) {
                nestorTeam = team;
            }
            if (hasClimeent) {
                climeentTeam = team;
            }
        }
        
        if (nestorTeam || climeentTeam) {
            console.log(`  🔍 Presencia de jugadores:`);
            if (nestorTeam) {
                console.log(`     Nestor está en el equipo: "${nestorTeam.teamName}"`);
            }
            if (climeentTeam) {
                console.log(`     Climeent está en el equipo: "${climeentTeam.teamName}"`);
            }
            if (nestorTeam && climeentTeam) {
                console.log(`     💥 ¡Coinciden en la liga "${league.name}"!`);
            }
        }
    }
    
    // Si no coinciden en ninguna liga, busquemos a los jugadores por separado en toda la colección de equipos
    console.log('\n--- Buscando a los jugadores en TODOS los equipos de la base de datos ---');
    const allTeams = await db.collection('fantasy_teams').find({}).toArray();
    for (const team of allTeams) {
        const players = team.players || [];
        const nestors = players.filter(p => p.toLowerCase().includes('nestor') || p.toLowerCase().includes('néstor'));
        const climeents = players.filter(p => p.toLowerCase().includes('climeent') || p.toLowerCase().includes('clement') || p.toLowerCase().includes('clim'));
        
        if (nestors.length > 0) {
            console.log(`- Encontrado Nestor (${nestors.join(', ')}) en el equipo "${team.teamName}" (Liga ID: ${team.leagueId})`);
        }
        if (climeents.length > 0) {
            console.log(`- Encontrado Climeent (${climeents.join(', ')}) en el equipo "${team.teamName}" (Liga ID: ${team.leagueId})`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
