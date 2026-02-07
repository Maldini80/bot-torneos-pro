import { MongoClient } from 'mongodb';
import 'dotenv/config';

// Configuration
const uri = process.env.DATABASE_URL;
const dbName = "tournamentBotDb"; // Correct DB name from database.js

if (!uri) {
    console.error("DATABASE_URL not found in .env");
    process.exit(1);
}

const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log("Connected to MongoDB for migration");
        const db = client.db(dbName);

        // 1. Get all active tournaments (or all tournaments to be safe)
        // We focus on those that are not 'finalizado'
        const tournaments = await db.collection('tournaments').find({ status: { $ne: 'finalizado' } }).toArray();

        console.log(`Found ${tournaments.length} active/pending tournaments.`);

        let totalUpdated = 0;

        for (const tournament of tournaments) {
            console.log(`Processing tournament: ${tournament.nombre} (${tournament.shortId})`);
            let tournamentUpdated = false;

            // Process approved teams
            if (tournament.teams && tournament.teams.aprobados) {
                const updates = {};
                const capitanes = Object.keys(tournament.teams.aprobados);

                for (const capitanId of capitanes) {
                    const teamData = tournament.teams.aprobados[capitanId];

                    // Skip if already has managerId
                    if (teamData.managerId) continue;

                    // Lookup team in 'teams' collection
                    // We use a regex for case-insensitive match on name
                    const registeredTeam = await db.collection('teams').findOne({
                        name: { $regex: new RegExp(`^${teamData.nombre}$`, 'i') },
                        guildId: tournament.guildId
                    });

                    if (registeredTeam && registeredTeam.managerId) {
                        // Prepare update
                        updates[`teams.aprobados.${capitanId}.managerId`] = registeredTeam.managerId;
                        console.log(`   -> Found manager ${registeredTeam.managerId} for team ${teamData.nombre}`);
                        tournamentUpdated = true;
                        totalUpdated++;
                    }
                }

                // Apply updates for this tournament
                if (tournamentUpdated && Object.keys(updates).length > 0) {
                    await db.collection('tournaments').updateOne(
                        { _id: tournament._id },
                        { $set: updates }
                    );
                    console.log(`   ✅ Updated tournament ${tournament.shortId}`);
                }
            }
        }

        console.log(`\nMigration completed. Total teams updated: ${totalUpdated}`);

    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.close();
    }
}

run();
