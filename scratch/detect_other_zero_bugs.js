import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    const leagues = await db.collection('fantasy_leagues').find({
        pointsMode: 'zero',
        status: { $ne: 'closed' }
    }).toArray();
    
    console.log(`=== BUSCANDO OTROS JUGADORES CON ANOMALÍAS DE BASEPOINTS ===`);
    
    const playerColl = db.collection('player_profiles');
    const teamColl = db.collection('fantasy_teams');
    
    let anomalies = [];
    
    for (const league of leagues) {
        const basePointsMap = league.basePoints || {};
        
        // Fetch all teams in this league
        const teams = await teamColl.find({ leagueId: league._id.toString() }).toArray();
        if (teams.length === 0) continue;
        
        // Find all unique players owned in this league
        const ownedPlayers = new Set();
        teams.forEach(t => {
            (t.players || []).forEach(p => ownedPlayers.add(p));
        });
        
        for (const playerName of ownedPlayers) {
            const player = await playerColl.findOne({
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            
            if (!player) continue;
            
            const vpgPoints = player.stats?.vpgPoints || 0;
            
            // Check if player has basePoints defined in this league
            let base = basePointsMap[player.eaPlayerName];
            if (base === undefined) {
                const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
                if (foundKey) {
                    base = basePointsMap[foundKey];
                }
            }
            
            // Si el basePoints es 0 o undefined, y el jugador tiene bastantes puntos en VPG (por ejemplo, > 30)
            if ((base === 0 || base === undefined) && vpgPoints > 30) {
                // Encontrar qué equipo lo tiene
                const ownerTeam = teams.find(t => t.players.includes(playerName));
                const isStarter = ownerTeam && (
                    (ownerTeam.lineup?.POR === playerName) ||
                    (ownerTeam.lineup?.DFC || []).includes(playerName) ||
                    (ownerTeam.lineup?.MC || []).includes(playerName) ||
                    (ownerTeam.lineup?.DC || []).includes(playerName)
                );
                
                anomalies.push({
                    leagueId: league._id,
                    leagueName: league.name,
                    playerName: player.eaPlayerName,
                    vpgPoints,
                    baseValue: base === undefined ? 'Undefined' : 0,
                    teamName: ownerTeam ? ownerTeam.teamName : 'Ninguno',
                    ownerName: ownerTeam ? (ownerTeam.ownerName || ownerTeam.discordId) : 'Ninguno',
                    isStarter
                });
            }
        }
    }
    
    console.log(`\nSe encontraron ${anomalies.length} anomalías en total:`);
    
    // Group anomalies by player to see which players are causing the most issues
    const playerGroups = {};
    for (const a of anomalies) {
        if (!playerGroups[a.playerName]) {
            playerGroups[a.playerName] = [];
        }
        playerGroups[a.playerName].push(a);
    }
    
    for (const [playerName, list] of Object.entries(playerGroups)) {
        console.log(`\n👤 Jugador: "${playerName}" (Puntos VPG actuales: ${list[0].vpgPoints})`);
        console.log(`   Afecta a ${list.length} ligas:`);
        for (const item of list) {
            console.log(`   - Liga: "${item.leagueName}" | Equipo: "${item.teamName}" (${item.ownerName})`);
            console.log(`     * Base: ${item.baseValue} | ¿Es titular?: ${item.isStarter ? 'SÍ' : 'NO'}`);
        }
    }
    
    process.exit(0);
}

run();
