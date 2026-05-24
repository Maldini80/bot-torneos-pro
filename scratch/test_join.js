// scratch/test_join.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const leagueId = "6a0dde52bdf3d90ac458d9cf";
    const discordId = "219894262630711297"; // jose discord id or similar
    const teamName = "SevillaFC";

    console.log('Testing join with:', { leagueId, discordId, teamName });

    try {
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
        console.log('League found:', league);
        if (!league) {
            console.log('League not found!');
            process.exit(1);
        }

        const existing = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
        console.log('Existing team:', existing);

        const count = await db.collection('fantasy_teams').countDocuments({ leagueId });
        console.log('Current count:', count);

        const isAdminUser = true; // simulated

        const team = {
            discordId,
            discordUsername: "Jose",
            discordAvatar: null,
            leagueId,
            teamName: teamName.trim(),
            balance: league.initialBudget,
            players: [],
            lineup: { POR: null, DFC: [], MC: [], DC: [] },
            formation: '4-3-3',
            points: 0,
            approved: isAdminUser,
            joinedAt: new Date()
        };

        const res = await db.collection('fantasy_teams').insertOne(team);
        console.log('Insert result:', res);

        // cleanup
        await db.collection('fantasy_teams').deleteOne({ _id: res.insertedId });
        console.log('Cleaned up successfully.');

    } catch (e) {
        console.error('Error occurred:', e);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
