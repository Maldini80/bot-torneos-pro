import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const collections = await db.listCollections().toArray();
        console.log(`Searching across ${collections.length} collections for Satita's ID or PSN...`);
        
        for (const colInfo of collections) {
            const colName = colInfo.name;
            
            // Search by Discord ID
            const byId = await db.collection(colName).find({
                $or: [
                    { discordId: '1264218593793413182' },
                    { userId: '1264218593793413182' },
                    { capitanId: '1264218593793413182' },
                    { managerId: '1264218593793413182' }
                ]
            }).toArray();
            
            if (byId.length > 0) {
                console.log(`\n[FOUND BY DISCORD ID] Collection: ${colName}`);
                console.log(JSON.stringify(byId, null, 2));
            }

            // Search by PSN / Game ID text
            const byPsn = await db.collection(colName).find({
                $or: [
                    { gameId: /Satiiita03/i },
                    { psnId: /Satiiita03/i },
                    { eaPlayerName: /Satiiita03/i }
                ]
            }).toArray();
            
            if (byPsn.length > 0) {
                console.log(`\n[FOUND BY PSN "Satiiita03"] Collection: ${colName}`);
                console.log(JSON.stringify(byPsn, null, 2));
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
