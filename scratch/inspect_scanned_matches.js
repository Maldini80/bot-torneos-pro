import { connectDb, getDb } from '../database.js';
import mongoose from 'mongoose';

async function run() {
    await connectDb();
    const db = getDb();
    const player = await db.collection('player_profiles').findOne();
    console.log('Sample Player Profile:', JSON.stringify(player, null, 2));
    await mongoose.connection.close();
    process.exit(0);
}
run();
