import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();

    const db = client.db('tournamentBotDb');
    
    const names = ['MonKeyDFFYLU', 'ruben10_03', 'Aaron14'];
    for (const name of names) {
        console.log(`\nSearching for ${name}...`);
        const players = await db.collection('player_profiles').find({ 
            eaPlayerName: new RegExp('^' + name + '$', 'i') 
        }).toArray();
        
        console.log(`Found ${players.length} documents:`);
        players.forEach((p, idx) => {
            console.log(`[${idx}] ID: ${p._id} | Name: ${p.eaPlayerName} | Club: ${p.lastClub} | Slug: ${p.vpgLeagueSlug} | Points: ${p.stats?.vpgPoints}`);
        });
    }
    
    await client.close();
}

main().catch(console.error);
