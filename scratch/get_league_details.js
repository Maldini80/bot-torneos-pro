// scratch/get_league_details.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Buscar usando ObjectId y string
    const id = "6a1104f781beb9b56df55c19";
    let league = await db.collection('fantasy_leagues').findOne({ _id: id });
    
    if (!league) {
        try {
            league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(id) });
        } catch (e) {
            console.error('Error creating ObjectId:', e.message);
        }
    }
    
    if (league) {
        console.log('--- Detalles de la liga ---');
        console.log(JSON.stringify(league, null, 2));
    } else {
        console.log('No se encontró la liga con ID: ' + id);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
