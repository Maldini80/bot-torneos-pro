const { MongoClient } = require('mongodb');
require('dotenv').config();
(async () => {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const testDb = client.db('test');
    const teams = await testDb.collection('teams').find({}).toArray();
    
    console.log("Total teams:", teams.length);
    for (let i = 0; i < Math.min(5, teams.length); i++) {
        console.log(`Team: ${teams[i].name}, ELO: ${teams[i].elo}, Type: ${typeof teams[i].elo}`);
    }
    
    // Check for string elos
    const stringElos = teams.filter(t => typeof t.elo === 'string');
    console.log(`\nTeams with string ELO: ${stringElos.length}`);
    if (stringElos.length > 0) {
        console.log(`First string ELO team: ${stringElos[0].name}, ELO: ${stringElos[0].elo}`);
    }

    // Sort by ELO descending using Mongo's exact rules to see who is at the bottom
    const sortedTeams = await testDb.collection('teams').find({}).sort({ elo: -1 }).toArray();
    console.log(`\n--- Ranking End ---`);
    for (let i = Math.max(0, sortedTeams.length - 3); i < sortedTeams.length; i++) {
        console.log(`Rank ${i+1} Bottom Team: ${sortedTeams[i].name}, ELO: ${sortedTeams[i].elo}, Type: ${typeof sortedTeams[i].elo}`);
    }
    
    await client.close();
})();
