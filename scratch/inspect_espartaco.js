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
        
        // 1. Get profile
        const p = await db.collection('player_profiles').findOne({ 
            eaPlayerName: { $regex: new RegExp('^Espartac0_87$', 'i') } 
        });
        
        console.log('=== PERFIL DE ESPARTAC0_87 ===');
        if (!p) {
            console.log('No se encontró el perfil del jugador.');
            return;
        }
        console.log('Nombre:', p.eaPlayerName);
        console.log('Liga VPG Activa:', p.vpgLeagueSlug);
        console.log('Club VPG Activo:', p.lastClub);
        console.log('Puntos en DB (Actuales):', p.stats?.vpgPoints);
        console.log('MatchesPlayed en DB (Actuales):', p.stats?.matchesPlayed);
        console.log('vpgLastRaw:', p.stats?.vpgLastRaw);
        
        // 2. Search in zero leagues
        const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
        console.log('\n=== LIGAS MODO ZERO ACTIVAL ===');
        
        let foundAny = false;
        for (const l of leagues) {
            const basePointsMap = l.basePoints || {};
            const matchKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === 'espartac0_87');
            if (matchKey) {
                foundAny = true;
                const baseVal = basePointsMap[matchKey];
                const currentPointsInLeague = p.stats?.vpgPoints - baseVal;
                console.log(`LIGA: "${l.name}"`);
                console.log(`  - basePoints actual: ${baseVal}`);
                console.log(`  - Puntos netos actuales en esta liga: ${currentPointsInLeague}`);
                
                // Let's analyze if this basePoints value was set when he was in the old club or new club
                // Active points in superliga-spain-b (new club): 48.1
                // Inactive points in superliga-spain-a (old club): 197.9
                // Correct consolidated expected points: 246.0
                console.log(`  - Si actualizamos sus puntos en DB a 246.0 (total correcto):`);
                
                // Decisión de la migración:
                // Si basePoints (~232.3) está cerca de los puntos de la etapa activa (~48.1), la liga empezó DESPUÉS del traspaso.
                // En ese caso, basePoints se actualiza a 246.0. El neto sigue siendo 246.0 - 246.0 = 0.
                // Si basePoints está cerca de los puntos antiguos o es 0, la liga empezó ANTES del traspaso.
                // En ese caso, basePoints se queda igual y el jugador ganará los puntos nuevos en el club activo.
                const diffToActive = Math.abs(baseVal - 48.1);
                
                if (diffToActive <= 3) {
                    console.log(`    -> DECISIÓN MIGRACIÓN: Liga iniciada DESPUÉS del traspaso.`);
                    console.log(`       * basePoints nuevo se actualizaría a 246.0.`);
                    console.log(`       * Puntos netos futuros en esta liga: 246.0 - 246.0 = 0 (respetando que empezó con 0 en esta liga).`);
                } else {
                    const newNet = 246.0 - baseVal;
                    console.log(`    -> DECISIÓN MIGRACIÓN: Liga iniciada ANTES del traspaso.`);
                    console.log(`       * basePoints se mantiene en ${baseVal}.`);
                    console.log(`       * Puntos netos futuros en esta liga: 246.0 - ${baseVal} = ${newNet} pts.`);
                }
                console.log('------------------------------------------------');
            }
        }
        
        if (!foundAny) {
            console.log('No se encontró basePoints para Espartac0_87 en ninguna liga modo zero.');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
