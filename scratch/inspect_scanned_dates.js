import { getDb } from '../database.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27015/vpg-bot');
    const db = getDb();
    console.log('Connected to database');

    // 1. Find a team in superliga-spain-a
    const teamColl = db.collection('teams');
    const superligaTeams = await teamColl.find({ eaClubId: { $ne: null } }).toArray();
    console.log(`Found ${superligaTeams.length} total teams`);

    // Let's see some teams and their scanned matches
    const matchColl = db.collection('scanned_matches');
    const totalMatches = await matchColl.countDocuments();
    console.log(`Total scanned matches: ${totalMatches}`);

    // Let's get unique dates of matches for each team
    const teamMatchCounts = [];
    for (const team of superligaTeams.slice(0, 10)) {
        const clubId = team.eaClubId;
        const count = await matchColl.countDocuments({ [`clubs.${clubId}`]: { $exists: true } });
        teamMatchCounts.push({ name: team.name, clubId, count });
    }
    console.log('Sample teams and match counts:', teamMatchCounts);

    // Let's find unique dates of matches overall or for a specific team
    const sampleTeam = teamMatchCounts.find(t => t.count > 0) || teamMatchCounts[0];
    if (sampleTeam) {
        const matches = await matchColl.find({ [`clubs.${sampleTeam.clubId}`]: { $exists: true } }).toArray();
        const dates = new Set();
        matches.forEach(m => {
            if (m.timestamp) {
                const date = new Date(parseInt(m.timestamp) * 1000);
                dates.add(date.toISOString().split('T')[0]);
            }
        });
        console.log(`Unique match dates for ${sampleTeam.name}:`, Array.from(dates).sort());
    }

    await mongoose.disconnect();
}

run().catch(console.error);
