import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = "mongodb://VPGORDER:alealeale1@ac-rttwdgh-shard-00-00.zv1svgz.mongodb.net:27017,ac-rttwdgh-shard-00-01.zv1svgz.mongodb.net:27017,ac-rttwdgh-shard-00-02.zv1svgz.mongodb.net:27017/tournamentBotDb?ssl=true&replicaSet=atlas-7eetoc-shard-0&authSource=admin";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db();
        const players = await db.collection('player_profiles').find({}).toArray();
        console.log(`Total players: ${players.length}`);
        if (players.length === 0) return;

        const points = players.map(p => p.points || 0).sort((a, b) => a - b);
        console.log("Min points:", points[0]);
        console.log("Max points:", points[points.length - 1]);
        console.log("Percentile 25:", points[Math.floor(points.length * 0.25)]);
        console.log("Percentile 50 (Median):", points[Math.floor(points.length * 0.50)]);
        console.log("Percentile 75:", points[Math.floor(points.length * 0.75)]);
        console.log("Percentile 90:", points[Math.floor(points.length * 0.90)]);
        console.log("Percentile 95:", points[Math.floor(points.length * 0.95)]);
        
        // Print some sample players
        console.log("\nSample players:");
        players.slice(0, 10).forEach(p => {
            console.log(`Name: ${p.eaPlayerName}, Points: ${p.points}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
