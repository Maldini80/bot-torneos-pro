import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

// Jugadores confirmados como inflados por el bug de doble liga
const AFFECTED_PLAYERS = [
    'Retromoneybeatz',
    'nestor007',
    'xDiiego10#6089',
    '13alvaro12',
    'FrancM2P8',
    'zzRaydenzz',
    'not_ven00m'
];

const LEADERBOARD_POS_MAP = {
    'top_gk': 'POR',
    'top_cb': 'DFC',
    'top_fb': 'CARR',
    'top_cdm': 'MC',
    'top_cam': 'MC',
    'top_wingers': 'CARR',
    'top_strikers': 'DC'
};

async function fetchPlayerFromVpg(username) {
    const leagues = ['superliga-spain-a', 'superliga-spain-b'];
    const positions = Object.keys(LEADERBOARD_POS_MAP);
    const results = {};
    
    for (const league of leagues) {
        for (const pos of positions) {
            let offset = 0;
            while (offset < 600) {
                try {
                    const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
                    const res = await fetch(url, { headers: HEADERS });
                    if (!res.ok) break;
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) break;
                    const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
                    if (found) {
                        if (!results[league]) results[league] = {};
                        results[league][pos] = found;
                    }
                    if (players.length < 30) break;
                } catch (e) { break; }
                offset += 30;
            }
        }
    }
    
    return results;
}

function getLeagueDivisionMultiplier(slug) {
    if (!slug) return 1.0;
    const s = slug.toLowerCase().trim();
    if (s === 'superliga-spain-a' || s === 'superliga-spain-b') return 1.0;
    if (s.includes('segunda')) return 0.75;
    if (s.includes('tercera')) return 0.55;
    if (s.includes('cuarta')) return 0.40;
    if (s.includes('quinta')) return 0.30;
    return 1.0;
}

async function main() {
    const DRY_RUN = process.argv.includes('--execute') ? false : true;
    
    if (DRY_RUN) {
        console.log('=== MODO DRY RUN (añade --execute para aplicar cambios) ===\n');
    } else {
        console.log('=== MODO EJECUCIÓN - SE APLICARÁN CAMBIOS EN LA DB ===\n');
    }
    
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    const playerColl = db.collection('player_profiles');
    
    // También buscar standings para wins/losses/ties
    const standingsMap = {};
    for (const league of ['superliga-spain-a', 'superliga-spain-b']) {
        try {
            const res = await fetch(`https://api.virtualprogaming.com/public/leagues/${league}/table/`, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                const standings = Array.isArray(data) ? data : (data.data || []);
                for (const s of standings) {
                    const slug = String(s.team_slug || '').toLowerCase();
                    standingsMap[`${league}_${slug}`] = s;
                }
            }
        } catch (e) {}
    }
    
    for (const playerName of AFFECTED_PLAYERS) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Procesando: ${playerName}`);
        console.log('='.repeat(60));
        
        // 1. Obtener datos reales de VPG
        const vpgData = await fetchPlayerFromVpg(playerName);
        
        // 2. Agregar stats reales de todas las ligas
        let totalPJ = 0, totalGoals = 0, totalAssists = 0, totalPoints = 0;
        let totalShots = 0, totalSaves = 0, totalRedCards = 0, totalYellowCards = 0, totalCleanSheets = 0;
        let totalWins = 0, totalLosses = 0, totalTies = 0;
        let bestPosition = 'MC';
        let bestPJ = 0;
        let primaryLeague = null;
        let primaryTeamSlug = null;
        let primaryTeamName = null;
        let avatar = null, nationality = null;
        const allRatings = [];
        const vpgLastRawPerLeague = {};
        
        for (const [league, positions] of Object.entries(vpgData)) {
            let leaguePJ = 0, leagueGoals = 0, leagueAssists = 0, leaguePoints = 0;
            let leagueShots = 0, leagueSaves = 0, leagueRedCards = 0, leagueYellowCards = 0, leagueCleanSheets = 0;
            let leagueTeamSlug = null, leagueTeamName = null;
            
            for (const [posKey, data] of Object.entries(positions)) {
                const played = data.matches_played || 0;
                const points = parseFloat(data.points) || 0;
                const ratingSum = data.match_rating || 0;
                const avgRating = played > 0 ? ratingSum / played : 6.0;
                
                leaguePJ += played;
                leagueGoals += parseInt(data.goals) || 0;
                leagueAssists += parseInt(data.assists) || 0;
                leaguePoints += points;
                leagueShots += parseInt(data.shots) || 0;
                leagueSaves += parseInt(data.saves) || 0;
                leagueRedCards += parseInt(data.red_card) || 0;
                leagueYellowCards += parseInt(data.yellow_card) || 0;
                leagueCleanSheets += parseInt(data.clean_sheet) || 0;
                
                for (let i = 0; i < played; i++) {
                    allRatings.push(avgRating);
                }
                
                leagueTeamSlug = data.team_slug;
                leagueTeamName = data.team_name;
                if (data.user_avatar) avatar = data.user_avatar;
                if (data.user_nationality) nationality = data.user_nationality;
                
                const fantasyPos = LEADERBOARD_POS_MAP[posKey] || 'MC';
                if (played > bestPJ) {
                    bestPJ = played;
                    bestPosition = fantasyPos;
                }
            }
            
            // Calcular wins/losses/ties proporcionales a los PJ del jugador
            const standKey = `${league}_${leagueTeamSlug}`;
            const standing = standingsMap[standKey];
            if (standing && standing.played > 0) {
                const ratio = Math.min(1, leaguePJ / standing.played);
                totalWins += Math.round((standing.wins || 0) * ratio);
                totalLosses += Math.round((standing.losses || 0) * ratio);
                totalTies += Math.round((standing.draws || 0) * ratio);
            }
            
            totalPJ += leaguePJ;
            totalGoals += leagueGoals;
            totalAssists += leagueAssists;
            totalPoints += leaguePoints;
            totalShots += leagueShots;
            totalSaves += leagueSaves;
            totalRedCards += leagueRedCards;
            totalYellowCards += leagueYellowCards;
            totalCleanSheets += leagueCleanSheets;
            
            if (!primaryLeague || leaguePJ > (vpgData[primaryLeague] ? Object.values(vpgData[primaryLeague]).reduce((s, d) => s + (d.matches_played || 0), 0) : 0)) {
                primaryLeague = league;
                primaryTeamSlug = leagueTeamSlug;
                primaryTeamName = leagueTeamName;
            }
            
            vpgLastRawPerLeague[league] = {
                matchesPlayed: leaguePJ,
                goals: leagueGoals,
                assists: leagueAssists,
                shots: leagueShots,
                saves: leagueSaves,
                redCards: leagueRedCards,
                yellowCards: leagueYellowCards,
                cleanSheets: leagueCleanSheets,
                wins: totalWins,
                losses: totalLosses,
                ties: totalTies,
                vpgPoints: Math.round(leaguePoints * 10) / 10
            };
            
            console.log(`  ${league}: ${leagueTeamName} (${leagueTeamSlug}) → ${leaguePJ} PJ, ${Math.round(leaguePoints * 10) / 10} pts`);
        }
        
        totalPoints = Math.round(totalPoints * 10) / 10;
        
        // 3. Leer datos actuales de la DB
        const dbPlayer = await playerColl.findOne({ eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } });
        if (!dbPlayer) {
            console.log(`  ❌ Jugador no encontrado en la DB, saltando.`);
            continue;
        }
        
        const dbPts = dbPlayer.stats?.vpgPoints || 0;
        const dbPJ = dbPlayer.stats?.matchesPlayed || 0;
        
        console.log(`\n  DB actual:    ${dbPJ} PJ, ${dbPts} pts VPG`);
        console.log(`  Real (VPG):   ${totalPJ} PJ, ${totalPoints} pts VPG`);
        console.log(`  Diferencia:   ${dbPJ - totalPJ} PJ extra, ${Math.round((dbPts - totalPoints) * 10) / 10} pts extra`);
        console.log(`  Liga primaria: ${primaryLeague} (${primaryTeamName})`);
        console.log(`  Posición:      ${bestPosition}`);
        
        // 4. Construir las stats corregidas
        const correctedStats = {
            matchesPlayed: totalPJ,
            goals: totalGoals,
            assists: totalAssists,
            passesMade: dbPlayer.stats?.passesMade || 0,
            passesAttempted: dbPlayer.stats?.passesAttempted || 0,
            tacklesMade: dbPlayer.stats?.tacklesMade || 0,
            tacklesAttempted: dbPlayer.stats?.tacklesAttempted || 0,
            shots: totalShots,
            shotsOnTarget: dbPlayer.stats?.shotsOnTarget || 0,
            interceptions: dbPlayer.stats?.interceptions || 0,
            saves: totalSaves,
            redCards: totalRedCards,
            yellowCards: totalYellowCards,
            mom: dbPlayer.stats?.mom || 0,
            cleanSheets: totalCleanSheets,
            goalsConceded: dbPlayer.stats?.goalsConceded || 0,
            ratings: allRatings,
            wins: totalWins,
            losses: totalLosses,
            ties: totalTies,
            vpgPoints: totalPoints,
            vpgLastRaw: vpgLastRawPerLeague[primaryLeague] || {},
            vpgLastRawPerLeague: vpgLastRawPerLeague
        };
        
        // 5. Aplicar corrección
        if (!DRY_RUN) {
            await playerColl.updateOne(
                { _id: dbPlayer._id },
                { $set: { 
                    stats: correctedStats,
                    vpgLeagueSlug: primaryLeague,
                    vpgTeamSlug: primaryTeamSlug,
                    lastClub: primaryTeamName,
                    lastPosition: bestPosition,
                    ...(avatar ? { avatar } : {}),
                    ...(nationality ? { nationality } : {})
                }}
            );
            console.log(`  ✅ CORREGIDO en la DB.`);
        } else {
            console.log(`  🔍 [DRY RUN] Se corregiría a: ${totalPJ} PJ, ${totalPoints} pts VPG`);
        }
    }
    
    await client.close();
    console.log('\n=== PROCESO COMPLETADO ===');
}

main().catch(console.error);
