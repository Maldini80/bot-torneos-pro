import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('No se encontró a xpetruu.');
        process.exit(0);
    }
    
    const vpgPoints = player.stats?.vpgPoints || 0;
    
    const leagues = await db.collection('fantasy_leagues').find({
        pointsMode: 'zero',
        status: { $ne: 'closed' }
    }).toArray();
    
    const groups = {};
    
    for (const league of leagues) {
        let base = undefined;
        const basePointsMap = league.basePoints || {};
        const eaName = player.eaPlayerName;
        
        if (basePointsMap[eaName] !== undefined) {
            base = basePointsMap[eaName];
        } else {
            const keyLower = eaName.toLowerCase();
            const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === keyLower);
            if (foundKey !== undefined) {
                base = basePointsMap[foundKey];
            }
        }
        
        if (base === undefined) {
            base = 'No definida';
        }
        
        if (!groups[base]) {
            groups[base] = [];
        }
        groups[base].push(league.name);
    }
    
    console.log(`PUNTOS OFICIALES VPG: ${vpgPoints}`);
    console.log('\n--- RESUMEN POR GRUPO DE BASEPOINTS ---');
    for (const [base, list] of Object.entries(groups)) {
        const netPoints = base === 'No definida' ? 'N/A' : Math.max(0, Math.round((vpgPoints - Number(base)) * 10) / 10);
        console.log(`\nGrupo Base de Puntos: ${base} (Puntos netos puntuados: ${netPoints})`);
        console.log(`Cantidad de ligas: ${list.length}`);
        console.log(`Ligas: ${list.join(', ')}`);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
