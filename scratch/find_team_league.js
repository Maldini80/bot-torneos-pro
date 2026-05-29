import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const defaultDb = getDb();
    const testDb = getDb('test');

    console.log('=== CLUB DETAILS ===');
    const club = await defaultDb.collection('club_profiles').findOne({
        $or: [
            { eaClubId: 219198 }, // just in case
            { name: /rysix/i },
            { vpgTeamSlug: "rysix-gaming" }
        ]
    });
    console.log('Club Profile:', JSON.stringify(club, null, 2));

    console.log('\n=== LEAGUE DETAILS ===');
    // Let's find info about the league in testDb or defaultDb
    const testLeague = await testDb.collection('leagues').findOne({
        $or: [
            { slug: "segunda-division-a-spain" },
            { id: "segunda-division-a-spain" },
            { name: /segunda/i }
        ]
    });
    console.log('Test Db League:', JSON.stringify(testLeague, null, 2));

    const defaultLeague = await defaultDb.collection('fantasy_leagues').findOne({
        $or: [
            { slug: "segunda-division-a-spain" },
            { vpgLeagueSlug: "segunda-division-a-spain" }
        ]
    });
    console.log('Default Db Fantasy League:', JSON.stringify(defaultLeague, null, 2));

    console.log('\n=== VERIFIED USERS ===');
    const verified = await defaultDb.collection('verified_users').findOne({
        $or: [
            { eaPlayerName: /Hugo_Xx10xX/i },
            { psn: /Hugo_Xx10xX/i }
        ]
    });
    console.log('Verified User (tournamentBotDb):', JSON.stringify(verified, null, 2));

    const verifiedTest = await testDb.collection('verified_users').findOne({
        $or: [
            { eaPlayerName: /Hugo_Xx10xX/i },
            { psn: /Hugo_Xx10xX/i }
        ]
    });
    console.log('Verified User (testDb):', JSON.stringify(verifiedTest, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
