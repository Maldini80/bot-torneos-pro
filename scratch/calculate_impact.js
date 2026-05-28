import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

// Jugadores afectados con sus puntos reales vs inflados
const AFFECTED = [
    { name: 'Retromoneybeatz', inflatedPts: 467, realPts: 233.5 },
    { name: 'nestor007', inflatedPts: 209.4, realPts: 104.7 },
    { name: 'xDiiego10#6089', inflatedPts: 514.9, realPts: 268.1 },
    { name: '13alvaro12', inflatedPts: 291.8, realPts: 145.9 },
    { name: 'FrancM2P8', inflatedPts: 225, realPts: 120.5 },
    { name: 'zzRaydenzz', inflatedPts: 127.5, realPts: 92.2 },
    { name: 'not_ven00m', inflatedPts: 194.2, realPts: 97.1 },
];

function isPlayerInLineup(lineup, playerName) {
    if (!lineup || !playerName) return false;
    const nameLower = playerName.toLowerCase();
    if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
    if (Array.isArray(lineup.DFC) && lineup.DFC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.MC) && lineup.MC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.DC) && lineup.DC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.CARR) && lineup.CARR.some(p => p && p.toLowerCase() === nameLower)) return true;
    return false;
}

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    console.log('=== IMPACTO EN MANAGERS POR JUGADORES INFLADOS ===\n');
    
    // Para cada jugador afectado, buscar los equipos fantasy que lo tienen
    const leagueImpact = {}; // leagueId -> { leagueName, managers: [...] }
    
    for (const player of AFFECTED) {
        const extraPts = Math.round((player.inflatedPts - player.realPts) * 10) / 10;
        
        // Buscar equipos que tienen este jugador
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + player.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        }).toArray();
        
        for (const team of teams) {
            const leagueId = team.leagueId;
            
            // Obtener info de la liga
            if (!leagueImpact[leagueId]) {
                let league = null;
                try {
                    league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
                } catch (e) {
                    try {
                        league = await db.collection('fantasy_leagues').findOne({ _id: leagueId });
                    } catch (e2) {}
                }
                
                leagueImpact[leagueId] = {
                    leagueName: league ? league.name : 'Desconocida',
                    pointsMode: league ? (league.pointsMode || 'normal') : 'unknown',
                    basePoints: league ? (league.basePoints || {}) : {},
                    managers: {}
                };
            }
            
            const liga = leagueImpact[leagueId];
            
            // Verificar si está en el once titular
            const inLineup = isPlayerInLineup(team.lineup, player.name);
            
            // Calcular puntos extra recibidos
            // En modo zero: los puntos mostrados = vpgPoints - basePoints
            // Los puntos extra mostrados = inflatedPts - realPts (el basePoints se cancela)
            // Pero los puntos del equipo vienen del sync que calcula deltas
            // El total de puntos extra que pudieron llegar al equipo = extraPts
            // PERO solo si el jugador estaba en el once durante los syncs
            
            const managerId = team.discordId;
            if (!liga.managers[managerId]) {
                liga.managers[managerId] = {
                    teamName: team.teamName,
                    discordId: team.discordId,
                    currentPoints: team.points || 0,
                    affectedPlayers: [],
                    totalExtraPts: 0,
                    hasInLineup: false
                };
            }
            
            liga.managers[managerId].affectedPlayers.push({
                name: player.name,
                extraPts: extraPts,
                inLineup: inLineup
            });
            
            if (inLineup) {
                liga.managers[managerId].totalExtraPts += extraPts;
                liga.managers[managerId].hasInLineup = true;
            }
        }
    }
    
    // Mostrar resultados por liga
    let totalLeaguesAffected = 0;
    let totalManagersAffected = 0;
    
    for (const [leagueId, liga] of Object.entries(leagueImpact)) {
        if (liga.pointsMode !== 'zero') continue; // Solo ligas zero
        
        const managersWithImpact = Object.values(liga.managers).filter(m => m.hasInLineup);
        if (managersWithImpact.length === 0) continue;
        
        totalLeaguesAffected++;
        
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📋 Liga: ${liga.leagueName}`);
        console.log(`   Modo: ${liga.pointsMode}`);
        console.log(`${'─'.repeat(60)}`);
        
        for (const manager of Object.values(liga.managers)) {
            totalManagersAffected++;
            const pctImpact = manager.currentPoints > 0 ? ((manager.totalExtraPts / manager.currentPoints) * 100).toFixed(1) : '∞';
            
            console.log(`\n   👤 ${manager.teamName} (Puntos actuales: ${manager.currentPoints})`);
            
            for (const ap of manager.affectedPlayers) {
                const statusIcon = ap.inLineup ? '⚽ EN ONCE' : '🪑 SUPLENTE';
                console.log(`      ${statusIcon} ${ap.name}: +${ap.extraPts} pts extra${ap.inLineup ? ' ← AFECTADO' : ''}`);
            }
            
            if (manager.hasInLineup) {
                console.log(`      ⚠️  TOTAL PUNTOS EXTRA MÁXIMO: +${manager.totalExtraPts} pts (${pctImpact}% del total)`);
            }
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESUMEN:`);
    console.log(`  Ligas afectadas (modo zero): ${totalLeaguesAffected}`);
    console.log(`  Managers con jugadores inflados en el once: ${totalManagersAffected}`);
    console.log(`${'='.repeat(60)}`);
    
    await client.close();
}

main().catch(console.error);
