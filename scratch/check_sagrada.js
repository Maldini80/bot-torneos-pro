import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: "Oxygen Levante" });
    if (!league) {
        console.log('League "Oxygen Levante" not found');
        process.exit(1);
    }
    
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: "Sagrada"
    });
    
    if (team) {
        console.log(`=== SAGRADA TEAM DETAILS ===`);
        console.log(`Points: ${team.points}`);
        console.log(`Balance: ${team.balance.toLocaleString('es-ES')} €`);
        console.log(`Players: ${JSON.stringify(team.players)}`);
        console.log(`Lineup: ${JSON.stringify(team.lineup)}`);
        
        // Check basePoints for zzRaydenzz in Oxygen Levante
        const basePointsMap = league.basePoints || {};
        const raydenBase = basePointsMap["zzRaydenzz"] ?? basePointsMap["zzraydenzz"];
        console.log(`zzRaydenzz basePoints in Oxygen Levante: ${raydenBase}`);
    } else {
        console.log('Team "Sagrada" not found in Oxygen Levante');
    }
    
    process.exit(0);
}

run();
