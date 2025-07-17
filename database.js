// database.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida en las variables de entorno de Render.');
}
const client = new MongoClient(dbUrl);
let db;

export async function connectDb() {
    try {
        await client.connect();
        db = client.db('tournamentBotDb'); // Se conecta a la base de datos correcta
        console.log('[DATABASE] Conectado exitosamente a MongoDB Atlas.');
    } catch (err) {
        console.error('[DATABASE] ERROR FATAL AL CONECTAR CON MONGODB:', err);
        process.exit(1);
    }
}

export function getDb() {
    if (!db) {
        throw new Error('La base de datos no ha sido conectada todavía.');
    }
    return db; // Simplemente devuelve la conexión
}
