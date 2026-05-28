import { MongoClient } from 'mongodb';

// Try standard URL bypassing SRV resolver
const standardUrl = 'mongodb://VPGORDER:alealeale1@ac-rttwdgh-shard-00-00.zv1svgz.mongodb.net:27017,ac-rttwdgh-shard-00-01.zv1svgz.mongodb.net:27017,ac-rttwdgh-shard-00-02.zv1svgz.mongodb.net:27017/?ssl=true&authSource=admin';

async function test() {
    console.log("Connecting using standard connection string...");
    const client = new MongoClient(standardUrl);
    try {
        await client.connect();
        console.log("SUCCESSFULLY CONNECTED!");
        const db = client.db('tournamentBotDb');
        const coll = db.collection('player_profiles');
        const count = await coll.countDocuments();
        console.log("Profiles count:", count);
    } catch (err) {
        console.error("Failed standard connection:", err);
    } finally {
        await client.close();
    }
}

test();
