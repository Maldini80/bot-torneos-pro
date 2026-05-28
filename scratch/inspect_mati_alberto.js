import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const playerColl = db.collection('player_profiles');

        console.log('--- Inspecting NORABONMATI8 and XMATI___10X:');
        const matis = await playerColl.find({
            eaPlayerName: { $regex: /mati/i }
        }).toArray();
        for (const p of matis) {
            console.log(JSON.stringify({
                _id: p._id,
                name: p.eaPlayerName,
                club: p.lastClub,
                league: p.vpgLeagueSlug,
                points: p.stats?.vpgPoints,
                matches: p.stats?.matchesPlayed,
                vpgProfile: p.vpgProfile
            }, null, 2));
        }

        console.log('\n--- Inspecting AlbertoSG_97:');
        const alberto = await playerColl.findOne({
            eaPlayerName: { $regex: /^AlbertoSG_97$/i }
        });
        if (alberto) {
            console.log(JSON.stringify(alberto, null, 2));
        } else {
            console.log('AlbertoSG_97 not found.');
        }

        // Search test.teams for Casemuro City
        const testDb = client.db('test');
        const team = await testDb.collection('teams').findOne({
            $or: [
                { name: /casemuro/i },
                { vpgTeamSlug: /casemuro/i }
            ]
        });
        console.log('\n--- Team matching "casemuro":');
        console.log(JSON.stringify(team, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
