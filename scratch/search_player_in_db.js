import { MongoClient } from 'mongodb';

const uri = "mongodb://VPGORDER:alealeale1@ac-rttwdgh-shard-00-00.zv1svgz.mongodb.net:27017,ac-rttwdgh-shard-00-01.zv1svgz.mongodb.net:27017,ac-rttwdgh-shard-00-02.zv1svgz.mongodb.net:27017/tournamentBotDb?ssl=true&replicaSet=atlas-7eetoc-shard-0&authSource=admin";
const client = new MongoClient(uri);

async function main() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const p = await db.collection('player_profiles').findOne({ 
            eaPlayerName: { $regex: /n3ww1s/i }
        });
        if (p) {
            console.log("Found player in database:");
            console.log(JSON.stringify(p, null, 2));
        } else {
            console.log("Player not found in database.");
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.close();
    }
    process.exit(0);
}

main().catch(console.error);
