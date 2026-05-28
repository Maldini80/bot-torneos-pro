// scratch/inspect_lineup_structure.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Buscar un equipo con alineación de la liga "Oxygen Levante" o "IMPERIO GITANO"
    const team = await db.collection('fantasy_teams').findOne({ 
        lineup: { $exists: true, $ne: null } 
    });
    
    if (team) {
        console.log(`Equipo: ${team.teamName}`);
        console.log('Alineación (lineup):');
        console.log(JSON.stringify(team.lineup, null, 2));
    } else {
        console.log('No se encontró ningún equipo con alineación en la base de datos.');
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
