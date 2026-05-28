// scratch/print_team_players.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const targetLigas = [
        { name: "Tempus x", id: "6a1349cd95bac5e6a15a7810" },
        { name: "Oxygen Levante", id: "6a1366e695bac5e6a15a782a" },
        { name: "ADCEUTA ESPORTS", id: "6a145946ae60292863d37d2e" }
    ];
    
    for (const liga of targetLigas) {
        console.log(`\n================ LIGA: ${liga.name} ===============`);
        const teams = await db.collection('fantasy_teams').find({ leagueId: liga.id }).toArray();
        for (const team of teams) {
            console.log(`- Equipo: "${team.teamName}" (Mánager: ${team.captainName || team.discordId})`);
            console.log(`  Jugadores: ${JSON.stringify(team.players)}`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
