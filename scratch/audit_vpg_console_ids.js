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

        console.log('--- INICIANDO AUDITORÍA GLOBAL DE CONSOLAS DE VPG ---');
        
        // 1. Obtener todos los perfiles de VPG (los que tienen liga asignada)
        const vpgPlayers = await playerColl.find({ vpgLeagueSlug: { $exists: true, $ne: null } }).toArray();
        console.log(`Cargados ${vpgPlayers.length} jugadores de VPG activos en el Fantasy.`);

        let apiCalls = 0;
        let mergedCount = 0;

        for (const player of vpgPlayers) {
            let vpgProfile = player.vpgProfile;

            // Si no tiene el perfil VPG en caché local, lo descargamos (máximo 40 peticiones para no saturar la API en este test)
            if (!vpgProfile || !vpgProfile.lastChecked) {
                if (apiCalls >= 40) {
                    continue; // Límite de seguridad de llamadas en este script
                }

                apiCalls++;
                const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(player.eaPlayerName)}/`;
                console.log(`[API] (${apiCalls}/40) Consultando VPG para: ${player.eaPlayerName}...`);
                
                try {
                    await new Promise(r => setTimeout(r, 100)); // Delay prudencial
                    const res = await fetch(url, { headers: HEADERS });
                    if (res.ok) {
                        const data = await res.json();
                        vpgProfile = {
                            username: data.username || null,
                            psn: data.psn || null,
                            origin: data.origin || null,
                            xbox: data.xbox || null,
                            lastChecked: new Date()
                        };
                        // Guardar en la ficha para no volver a consultar nunca más
                        await playerColl.updateOne({ _id: player._id }, { $set: { vpgProfile } });
                    }
                } catch (e) {
                    console.error(`Error consultando VPG para ${player.eaPlayerName}:`, e.message);
                }
            }

            if (vpgProfile) {
                // Coleccionar todas las IDs posibles asociadas a este usuario de VPG
                const idsToCheck = [
                    vpgProfile.psn,
                    vpgProfile.origin,
                    vpgProfile.xbox
                ].map(id => id ? id.trim() : '').filter(id => id && id.toLowerCase() !== player.eaPlayerName.toLowerCase());

                for (const consoleId of idsToCheck) {
                    // Buscar si hay algún duplicado inactivo creado por el escáner de EA con esta ID de consola
                    const duplicate = await playerColl.findOne({
                        eaPlayerName: { $regex: new RegExp('^' + consoleId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') },
                        vpgLeagueSlug: { $exists: false } // Que sea el duplicado inactivo
                    });

                    if (duplicate) {
                        console.log(`\n[COINCIDENCIA ENCONTRADA!]`);
                        console.log(`- Perfil Principal VPG: "${player.eaPlayerName}"`);
                        console.log(`- Perfil Duplicado EA (ID Consola): "${duplicate.eaPlayerName}" (${consoleId})`);
                        console.log(`Fusionando...`);

                        try {
                            const { mergePlayerProfiles } = await import('../src/utils/fantasyVpgSync.js');
                            await mergePlayerProfiles(db, player.eaPlayerName, duplicate.eaPlayerName);
                            mergedCount++;
                        } catch (err) {
                            console.error(`Error fusionando:`, err.message);
                        }
                    }
                }
            }
        }

        console.log(`\n--- AUDITORÍA FINALIZADA ---`);
        console.log(`Llamadas a la API realizadas: ${apiCalls}`);
        console.log(`Nuevos perfiles duplicados fusionados: ${mergedCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
