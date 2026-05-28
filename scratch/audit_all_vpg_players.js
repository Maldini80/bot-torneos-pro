import { MongoClient } from 'mongodb';
import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const playerColl = db.collection('player_profiles');

        console.log('--- SANACIÓN COMPLETA DE DUPLICADOS EN LA BASE DE DATOS ---');
        
        // Cargar todos los jugadores VPG activos en el Fantasy
        const vpgPlayers = await playerColl.find({ vpgLeagueSlug: { $exists: true, $ne: null } }).toArray();
        console.log(`Total jugadores VPG activos: ${vpgPlayers.length}`);

        // Separar entre los que ya tienen caché y los que no
        const cachedPlayers = vpgPlayers.filter(p => p.vpgProfile && p.vpgProfile.lastChecked);
        const uncachedPlayers = vpgPlayers.filter(p => !p.vpgProfile || !p.vpgProfile.lastChecked);

        console.log(`Jugadores con perfil en caché: ${cachedPlayers.length}`);
        console.log(`Jugadores pendientes de consultar API VPG: ${uncachedPlayers.length}`);

        let mergedCount = 0;
        let checkedCount = 0;

        // --- 1. PROCESAR PRIMERO LOS QUE YA TIENEN CACHÉ ---
        console.log('\n--- FASE 1: Evaluando perfiles en caché local (instantáneo)...');
        for (const player of cachedPlayers) {
            const vpgProfile = player.vpgProfile;
            const idsToCheck = [
                vpgProfile.psn,
                vpgProfile.origin,
                vpgProfile.xbox
            ].map(id => id ? id.trim() : '').filter(id => id && id.toLowerCase() !== player.eaPlayerName.toLowerCase());

            for (const consoleId of idsToCheck) {
                const duplicate = await playerColl.findOne({
                    eaPlayerName: { $regex: new RegExp('^' + consoleId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') },
                    vpgLeagueSlug: { $exists: false }
                });

                if (duplicate) {
                    console.log(`[MERGE CACHE] Fusión: ${duplicate.eaPlayerName} -> ${player.eaPlayerName}`);
                    try {
                        const { mergePlayerProfiles } = await import('../src/utils/fantasyVpgSync.js');
                        await mergePlayerProfiles(db, player.eaPlayerName, duplicate.eaPlayerName);
                        mergedCount++;
                    } catch (err) {
                        console.error(`Error:`, err.message);
                    }
                }
            }
        }

        // --- 2. PROCESAR LOS QUE FALTA CONSULTAR EN API VPG (en bloques de 30 paralelos) ---
        console.log('\n--- FASE 2: Consultando API de VPG y fusionando nuevos perfiles...');
        const BATCH_SIZE = 30;
        const totalToFetch = uncachedPlayers.length; // Sin límite artificial para procesarlos todos de una vez
        console.log(`Procesando los ${totalToFetch} jugadores restantes desde la API oficial de VPG...`);

        for (let i = 0; i < totalToFetch; i += BATCH_SIZE) {
            const batch = uncachedPlayers.slice(i, i + BATCH_SIZE);
            console.log(`Progreso: [${i}/${totalToFetch}] consultados...`);
            
            await Promise.all(batch.map(async (player) => {
                const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(player.eaPlayerName)}/`;
                try {
                    const res = await fetch(url, { headers: HEADERS });
                    if (res.ok) {
                        const data = await res.json();
                        const vpgProfile = {
                            username: data.username || null,
                            psn: data.psn || null,
                            origin: data.origin || null,
                            xbox: data.xbox || null,
                            lastChecked: new Date()
                        };

                        await playerColl.updateOne({ _id: player._id }, { $set: { vpgProfile } });
                        checkedCount++;

                        const idsToCheck = [
                            vpgProfile.psn,
                            vpgProfile.origin,
                            vpgProfile.xbox
                        ].map(id => id ? id.trim() : '').filter(id => id && id.toLowerCase() !== player.eaPlayerName.toLowerCase());

                        for (const consoleId of idsToCheck) {
                            const duplicate = await playerColl.findOne({
                                eaPlayerName: { $regex: new RegExp('^' + consoleId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') },
                                vpgLeagueSlug: { $exists: false }
                            });

                            if (duplicate) {
                                console.log(`[MERGE API] Coincidencia: ${duplicate.eaPlayerName} -> ${player.eaPlayerName}`);
                                const { mergePlayerProfiles } = await import('../src/utils/fantasyVpgSync.js');
                                await mergePlayerProfiles(db, player.eaPlayerName, duplicate.eaPlayerName);
                                mergedCount++;
                            }
                        }
                    }
                } catch (e) {
                    // Ignorar
                }
            }));

            // Esperar 150ms entre bloques para ser respetuoso con la API de VPG
            await new Promise(r => setTimeout(r, 150));
        }

        console.log(`\n--- SANACIÓN GLOBAL COMPLETADA ---`);
        console.log(`Evaluados desde caché: ${cachedPlayers.length}`);
        console.log(`Consultados nuevos en API: ${checkedCount}`);
        console.log(`Total de duplicados fusionados: ${mergedCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
