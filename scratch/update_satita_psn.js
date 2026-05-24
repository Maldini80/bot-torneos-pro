import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const discordId = "1264218593793413182";
        const oldRecord = await db.collection('verified_users').findOne({ discordId });
        
        if (!oldRecord) {
            console.log('No se encontró el registro verificado de Satita.');
            return;
        }
        
        console.log('Registro actual de Satita:', JSON.stringify(oldRecord, null, 2));
        
        const result = await db.collection('verified_users').updateOne(
            { discordId },
            { $set: { gameId: "Satiiita03" } }
        );
        
        console.log('Resultado de la actualización:', result);
        
        const newRecord = await db.collection('verified_users').findOne({ discordId });
        console.log('Nuevo registro de Satita:', JSON.stringify(newRecord, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
