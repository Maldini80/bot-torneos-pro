import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    console.log('=== ANALIZANDO EQUIPOS QUE SUMARÁN 0 PUNTOS CON 11 TITULARES ===\n');
    
    // Read simulation results
    let simText = '';
    try {
        simText = fs.readFileSync('scratch/resultado_simulacion.txt', 'utf-8');
    } catch (e) {
        console.error('Error al leer el archivo de simulación:', e.message);
        return;
    }
    
    // Parse teams that scored 0 points in simulation
    // Pattern: 👉 Equipo: "Team Name" (discordUsername) -> 0 puntos hoy
    const zeroTeamsList = [];
    const lines = simText.split('\n');
    for (const line of lines) {
        if (line.includes('-> 0 puntos hoy')) {
            // Extract team name
            // Format: 👉 Equipo: "Team Name" (discordUsername) -> 0 puntos hoy
            const match = line.match(/👉 Equipo: "([^"]+)" \(([^)]+)\)/);
            if (match) {
                zeroTeamsList.push({
                    name: match[1],
                    discord: match[2]
                });
            }
        }
    }
    
    console.log(`Encontrados ${zeroTeamsList.length} equipos con 0 puntos en la simulación.`);
    
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        let matchCount = 0;
        
        for (const zt of zeroTeamsList) {
            // Find team in database
            const team = await db.collection('fantasy_teams').findOne({
                $or: [
                    { teamName: zt.name },
                    { name: zt.name }
                ]
            });
            
            if (!team) continue;
            
            // Check starters count
            const lineup = team.lineup || {};
            const starters = [];
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
            
            if (starters.length === 11) {
                matchCount++;
                
                // Get league info
                let league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
                if (!league) {
                    league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
                }
                const leagueName = league ? league.name : 'Unknown';
                
                // Let's analyze why they scored 0 points
                // We will check the 11 starting players and see if they played/scored yesterday
                const playerDetails = [];
                for (const pName of starters) {
                    const pProfile = await db.collection('player_profiles').findOne({
                        eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                    });
                    
                    if (!pProfile) {
                        playerDetails.push(`- ${pName}: No registrado en BD (0 pts)`);
                    } else {
                        // Check if they competed on VPG yesterday
                        // If vpgLeagueSlug is empty, they are not active in VPG.
                        const isVpgActive = !!pProfile.vpgLeagueSlug;
                        const lastRaw = pProfile.stats?.vpgLastRaw || pProfile.stats || {};
                        const lastVpgPoints = lastRaw.vpgPoints || 0;
                        const club = pProfile.lastClub || 'Sin club';
                        
                        playerDetails.push(`- ${pName} (${club}): ${isVpgActive ? 'Activo en VPG' : 'Sin contrato activo en VPG'} | Puntos en BD: ${pProfile.stats?.vpgPoints || 0} (Baseline VPG: ${lastVpgPoints})`);
                    }
                }
                
                console.log(`${matchCount}. Equipo: "${zt.name}" (${zt.discord})`);
                console.log(`   - Liga: "${leagueName}"`);
                console.log(`   - Razón de 0 puntos: Ninguno de sus 11 titulares ha puntuado en VPG ayer (todos obtuvieron delta 0).`);
                console.log(`   - Estado de los 11 titulares:`);
                playerDetails.forEach(detail => console.log(`     ${detail}`));
                console.log('------------------------------------------------------------\n');
            }
        }
        
        console.log(`Total de equipos con exactamente 11 titulares que sumarán 0 puntos: ${matchCount}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
