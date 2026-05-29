import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    
    // We can access both databases
    const defaultDb = getDb();
    const testDb = getDb('test');

    console.log('Listing collections in defaultDb (tournamentBotDb):');
    const colsDefault = await defaultDb.listCollections().toArray();
    console.log(colsDefault.map(c => c.name));

    console.log('\nListing collections in testDb:');
    const colsTest = await testDb.listCollections().toArray();
    console.log(colsTest.map(c => c.name));

    const searchTerm = "Hugo_xx10xx";
    const regex = new RegExp(searchTerm, "i");

    console.log(`\n=== Searching for "${searchTerm}" ===`);

    // Search in player_profiles (defaultDb)
    if (colsDefault.some(c => c.name === 'player_profiles')) {
        const profiles = await defaultDb.collection('player_profiles').find({
            $or: [
                { eaPlayerName: regex },
                { vpgPlayerName: regex },
                { discordId: regex },
                { vpgPlayerSlug: regex }
            ]
        }).toArray();
        console.log(`\nFound in player_profiles (tournamentBotDb): ${profiles.length}`);
        for (const p of profiles) {
            console.log(JSON.stringify(p, null, 2));
        }
    }

    // Search in club_profiles (defaultDb)
    if (colsDefault.some(c => c.name === 'club_profiles')) {
        const clubs = await defaultDb.collection('club_profiles').find({
            $or: [
                { managerDiscordId: regex },
                { assistantDiscordId: regex }
            ]
        }).toArray();
        console.log(`\nFound in club_profiles (tournamentBotDb): ${clubs.length}`);
        for (const c of clubs) {
            console.log(JSON.stringify(c, null, 2));
        }
    }

    // Search in teams (testDb)
    if (colsTest.some(c => c.name === 'teams')) {
        const teams = await testDb.collection('teams').find({
            $or: [
                { "players.eaPlayerName": regex },
                { "players.vpgPlayerName": regex },
                { "players.discordId": regex }
            ]
        }).toArray();
        console.log(`\nFound in teams (testDb): ${teams.length}`);
        for (const t of teams) {
            console.log(`Team: ${t.name} (ID: ${t._id})`);
            // print matching player info if present
            const player = t.players?.find(p => regex.test(p.eaPlayerName) || regex.test(p.vpgPlayerName) || regex.test(p.discordId));
            console.log('Player record in team:', player);
        }
    }

    // Let's also check if there is a general players collection in testDb or defaultDb
    for (const colName of ['players', 'users', 'members']) {
        if (colsDefault.some(c => c.name === colName)) {
            const res = await defaultDb.collection(colName).find({
                $or: [
                    { username: regex },
                    { eaPlayerName: regex },
                    { discordName: regex },
                    { name: regex }
                ]
            }).toArray();
            console.log(`\nFound in defaultDb.${colName}: ${res.length}`);
            for (const r of res) console.log(r);
        }
        if (colsTest.some(c => c.name === colName)) {
            const res = await testDb.collection(colName).find({
                $or: [
                    { username: regex },
                    { eaPlayerName: regex },
                    { discordName: regex },
                    { name: regex }
                ]
            }).toArray();
            console.log(`\nFound in testDb.${colName}: ${res.length}`);
            for (const r of res) console.log(r);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
