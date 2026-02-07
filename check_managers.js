import { MongoClient } from 'mongodb';

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db('torneos_bot'); // Adjust DB name if different

        console.log("Connected to MongoDB");

        // Find one tournament with approved teams
        const tournament = await db.collection('tournaments').findOne({ "teams.aprobados": { $exists: true, $ne: {} } });

        if (!tournament) {
            console.log("No tournaments found with approved teams.");
        } else {
            console.log(`Checking tournament: ${tournament.nombre} (${tournament.shortId})`);
            const teams = Object.values(tournament.teams.aprobados);
            if (teams.length > 0) {
                const sampleTeam = teams[0];
                console.log("Sample Team Data Keys:", Object.keys(sampleTeam));
                console.log("Full Sample Team Data:", JSON.stringify(sampleTeam, null, 2));

                // Check if any team has managerId
                const teamsWithManager = teams.filter(t => t.managerId);
                console.log(`Teams with explicit 'managerId' in this tournament: ${teamsWithManager.length}`);
            }
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
