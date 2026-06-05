// scratch/seed_test_players.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL no está definida en las variables de entorno (.env).');
    process.exit(1);
}

const draftShortId = process.argv[2];
if (!draftShortId) {
    console.error('❌ Error: Debes especificar el shortId del draft. Ejemplo: node scratch/seed_test_players.js ab12cd');
    process.exit(1);
}

async function seed() {
    const client = new MongoClient(dbUrl);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) {
            console.error(`❌ Error: No se encontró ningún draft con shortId "${draftShortId}"`);
            client.close();
            process.exit(1);
        }

        console.log(`🔌 Conectado. Sembrando jugadores de prueba para el draft "${draft.name}"...`);

        const positions = ['GK', 'DFC', 'CARR', 'MC', 'DC'];
        const testPlayers = [];

        for (let i = 1; i <= 20; i++) {
            const randomPos = positions[Math.floor(Math.random() * positions.length)];
            const randomSecPos = Math.random() > 0.5 ? positions[Math.floor(Math.random() * positions.length)] : 'NONE';
            
            const userId = `test_${Math.random().toString(36).substr(2, 9)}`;
            
            testPlayers.push({
                userId,
                userName: `TestUser_${i}`,
                psnId: `TestPSN_${i}_${randomPos}`,
                twitter: 'NONE',
                whatsapp: `6000000${i.toString().padStart(2, '0')}`,
                primaryPosition: randomPos,
                secondaryPosition: randomSecPos === randomPos ? 'NONE' : randomSecPos,
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                createdAt: new Date()
            });
        }

        // Insertar en el draft
        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $push: { players: { $each: testPlayers } } }
        );

        console.log(`✅ ¡Éxito! Se han añadido 20 jugadores de prueba al draft.`);
        console.log(`📋 Distribución aproximada de posiciones añadidas:`);
        const counts = testPlayers.reduce((acc, p) => {
            acc[p.primaryPosition] = (acc[p.primaryPosition] || 0) + 1;
            return acc;
        }, {});
        console.log(counts);

    } catch (err) {
        console.error('❌ Error ejecutando la siembra:', err);
    } finally {
        await client.close();
    }
}

seed();
