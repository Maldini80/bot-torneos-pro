import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- CLIIMEENT in fantasy_teams ---');
    const teams = await db.collection('fantasy_teams').find({
        players: { $regex: /^cliimeent$/i }
    }).toArray();
    
    for (const team of teams) {
        const lid = ObjectId.isValid(team.leagueId) ? new ObjectId(team.leagueId) : team.leagueId;
        const league = await db.collection('fantasy_leagues').findOne({ _id: lid });
        
        const base = league && league.basePoints ? league.basePoints[Object.keys(league.basePoints).find(k => k.toLowerCase() === 'cliimeent')] : null;
        console.log(`- League: "${league ? league.name : 'Unknown'}" (ID: ${team.leagueId}), PointsMode: ${league ? league.pointsMode : 'N/A'}`);
        console.log(`  Team: "${team.teamName}" (ID: ${team._id})`);
        console.log(`  BasePoints for CLIIMEENT: ${base}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
