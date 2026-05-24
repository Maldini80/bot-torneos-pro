// scratch/register_thunder_bot.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    console.log('\n--- Registering Thunder Gaming in Bot DB ---');
    
    // Check if already exists
    const exists = await db.collection('teams').findOne({ name: 'Thunder Gaming' });
    if (exists) {
        console.log('Thunder Gaming already exists in bot database!');
        console.log(JSON.stringify(exists, null, 2));
    } else {
        const doc = {
            name: "Thunder Gaming",
            abbreviation: "TGD",
            guildId: "1392406961957638205",
            league: "GOLD",
            logoUrl: "https://i.imgur.com/3KxBLnR.png", // fallback placeholder
            captains: [],
            players: [],
            recruitmentOpen: true,
            twitterHandle: "EsThundergaming",
            elo: 1400,
            eaClubId: "44154",
            eaClubName: "Thunder Gaming",
            eaPlatform: "common-gen5",
            vpgLeagueSlug: "superliga-spain-a",
            vpgTeamSlug: "THUNDER-GAMING",
            strikes: 0,
            eloHistory: [
                {
                    date: new Date().toISOString(),
                    oldElo: 0,
                    newElo: 1400,
                    delta: 0,
                    reason: "initial_setup"
                }
            ],
            historicalStats: {
                tournamentsPlayed: 0,
                tournamentsWon: 0,
                tournamentsRunnerUp: 0,
                totalMatchesPlayed: 0,
                totalWins: 0,
                totalDraws: 0,
                totalLosses: 0,
                currentWinStreak: 0,
                bestWinStreak: 0,
                currentLossStreak: 0,
                worstLossStreak: 0,
                totalGoalsConceded: 0,
                totalGoalsScored: 0
            }
        };

        const res = await db.collection('teams').insertOne(doc);
        console.log('✅ Thunder Gaming registered successfully with ID:', res.insertedId);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
