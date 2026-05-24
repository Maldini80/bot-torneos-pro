import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();

    const db = client.db('tournamentBotDb');
    
    // 1. Inspect fantasy teams and see which players are registered in teams
    console.log("=== Fantasy Teams ===");
    const teams = await db.collection('fantasy_teams').find({}).toArray();
    for (const t of teams) {
        console.log(`Team: "${t.teamName}" (Manager: ${t.discordName})`);
        console.log(`- Players: ${JSON.stringify(t.players)}`);
    }

    // 2. Query player_profiles for these guys and dump their entire document
    const names = ['MonKeyDFFYLU', 'ruben10_03', 'Aaron14'];
    console.log("\n=== Player Documents ===");
    for (const name of names) {
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: name });
        console.log(`Player: ${name}`);
        console.log(JSON.stringify(player, null, 2));
    }

    await client.close();
}

main().catch(console.error);
