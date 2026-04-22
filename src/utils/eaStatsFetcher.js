// src/utils/eaStatsFetcher.js
import fetch from 'node-fetch';

/**
 * Recolector de estadísticas de EA FC.
 * Se encarga de conectarse a la API pública de Pro Clubs para descargar
 * el historial de partidos y agregar estadísticas de múltiples sesiones si hubo desconexiones.
 */

const EA_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/json',
    'Origin': 'https://www.ea.com',
    'Referer': 'https://www.ea.com/'
};

/**
 * Busca clubes en EA FC.
 * @param {string} clubName Nombre del club
 * @param {string} platform Plataforma (gen5, gen4, etc.)
 */
export async function searchClub(clubName, platform = 'common-gen5') {
    try {
        const url = `https://proclubs.ea.com/api/fc/allTimeLeaderboard/search?clubName=${encodeURIComponent(clubName)}&platform=${platform}`;
        const response = await fetch(url, { headers: EA_HEADERS });
        if (!response.ok) throw new Error(`EA API responded with status ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error en searchClub:', error);
        return null;
    }
}

/**
 * Obtiene y agrega las estadísticas de cara a cara entre dos clubes en las últimas horas.
 * Si jugaron múltiples partidos (ej. desconexión al min 30, y luego jugaron 60 mins), suma las estadísticas.
 * 
 * @param {string} clubIdA ID del Club Local
 * @param {string} clubIdB ID del Club Visitante
 * @param {string} platform Plataforma (ej: common-gen5)
 * @param {number} hoursLookback Cuántas horas atrás mirar para agregar partidos
 */
export async function fetchAndAggregateStats(clubIdA, clubIdB, platform = 'common-gen5', hoursLookback = 3) {
    if (!clubIdA || !clubIdB) return null;

    try {
        // Obtenemos los últimos partidos del Club A. EA devuelve los últimos 5-10 partidos del club.
        const urlFriendly = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubIdA}&platform=${platform}&matchType=friendlyMatch`;
        
        const [resFriendly] = await Promise.all([
            fetch(urlFriendly, { headers: EA_HEADERS }).catch(() => null)
        ]);

        let dataFriendly = [];
        if (resFriendly && resFriendly.ok) dataFriendly = await resFriendly.json().catch(() => []);

        if (!Array.isArray(dataFriendly)) dataFriendly = Object.values(dataFriendly || {});

        const data = [...dataFriendly].sort((a, b) => b.timestamp - a.timestamp);

        if (data.length === 0) {
            return null;
        }

        const timeLimit = (Date.now() / 1000) - (hoursLookback * 3600);
        
        // Filtramos los partidos donde el oponente es clubIdB y sucedieron dentro del margen de horas.
        const headToHeadMatches = data.filter(match => {
            const isWithinTime = match.timestamp > timeLimit;
            // Un partido involucra a ambos si las keys de match.clubs incluyen ambos IDs
            const clubsInvolved = Object.keys(match.clubs || {});
            const hasClubA = clubsInvolved.includes(String(clubIdA));
            const hasClubB = clubsInvolved.includes(String(clubIdB));
            return isWithinTime && hasClubA && hasClubB;
        });

        if (headToHeadMatches.length === 0) {
            return null;
        }

        // Agregamos las estadísticas
        const aggregatedStats = {
            matchesCount: headToHeadMatches.length,
            clubA: {
                goals: 0,
                goalsAgainst: 0,
                shots: 0,
                passesMade: 0,
                tacklesMade: 0,
                possessionAvg: 0,
                players: {}
            },
            clubB: {
                goals: 0,
                goalsAgainst: 0,
                shots: 0,
                passesMade: 0,
                tacklesMade: 0,
                possessionAvg: 0,
                players: {}
            }
        };

        let possessionSumA = 0;
        let possessionSumB = 0;

        const aggregatePlayers = (targetClubPlayers, sourcePlayersData, teamGoalsAgainst) => {
            if (!sourcePlayersData) return;
            for (const [playerId, pData] of Object.entries(sourcePlayersData)) {
                const pName = pData.playername || playerId;
                if (!targetClubPlayers[pName]) {
                    targetClubPlayers[pName] = {
                        name: pName,
                        pos: pData.pos || 'unknown',
                        goals: 0,
                        assists: 0,
                        ratingSum: 0,
                        saves: 0,
                        gamesPlayed: 0,
                        cleanSheets: 0,
                        goalsConceded: 0,
                        mom: 0 // Man of the match
                    };
                }
                
                targetClubPlayers[pName].goals += parseInt(pData.goals) || 0;
                targetClubPlayers[pName].assists += parseInt(pData.assists) || 0;
                targetClubPlayers[pName].ratingSum += parseFloat(pData.rating) || 0;
                targetClubPlayers[pName].saves += parseInt(pData.saves) || 0;
                targetClubPlayers[pName].mom += parseInt(pData.mom) || 0;
                targetClubPlayers[pName].gamesPlayed += 1;
                
                const posLower = (pData.pos || '').toLowerCase();
                if (posLower.includes('goalkeeper') || posLower.includes('gk') || posLower === 'portero') {
                     targetClubPlayers[pName].goalsConceded += teamGoalsAgainst;
                     if (teamGoalsAgainst === 0) {
                         targetClubPlayers[pName].cleanSheets += 1;
                     }
                }
            }
        };

        for (const match of headToHeadMatches) {
            const statsA = match.clubs[String(clubIdA)];
            const statsB = match.clubs[String(clubIdB)];

            if (statsA && statsB) {
                let goalsA = parseInt(statsA.goals) || 0;
                let goalsB = parseInt(statsB.goals) || 0;

                // --- FIX RESULTADOS FANTASMA (3-0 DNF de EA) ---
                if ((goalsA === 3 && goalsB === 0) || (goalsA === 0 && goalsB === 3)) {
                    let realGoalsA = 0;
                    let realGoalsB = 0;
                    
                    if (match.players && match.players[String(clubIdA)]) {
                        const playersA = Object.values(match.players[String(clubIdA)]);
                        realGoalsA = playersA.reduce((sum, p) => sum + parseInt(p.goals || 0), 0);
                    }
                    if (match.players && match.players[String(clubIdB)]) {
                        const playersB = Object.values(match.players[String(clubIdB)]);
                        realGoalsB = playersB.reduce((sum, p) => sum + parseInt(p.goals || 0), 0);
                    }
                    
                    goalsA = realGoalsA;
                    goalsB = realGoalsB;
                }
                // ----------------------------------------------
                
                aggregatedStats.clubA.goals += goalsA;
                aggregatedStats.clubA.goalsAgainst += parseInt(statsA.goalsAgainst) || 0;
                aggregatedStats.clubA.shots += parseInt(statsA.shots) || 0;
                aggregatedStats.clubA.passesMade += parseInt(statsA.passesMade) || 0;
                aggregatedStats.clubA.tacklesMade += parseInt(statsA.tacklesMade) || 0;
                possessionSumA += parseFloat(statsA.possession) || 50;

                aggregatedStats.clubB.goals += goalsB;
                aggregatedStats.clubB.goalsAgainst += parseInt(statsB.goalsAgainst) || 0;
                aggregatedStats.clubB.shots += parseInt(statsB.shots) || 0;
                aggregatedStats.clubB.passesMade += parseInt(statsB.passesMade) || 0;
                aggregatedStats.clubB.tacklesMade += parseInt(statsB.tacklesMade) || 0;
                possessionSumB += parseFloat(statsB.possession) || 50;
                
                // Extraer jugadores
                if (match.players) {
                    const playersA = match.players[String(clubIdA)];
                    const playersB = match.players[String(clubIdB)];
                    
                    aggregatePlayers(aggregatedStats.clubA.players, playersA, goalsB);
                    aggregatePlayers(aggregatedStats.clubB.players, playersB, goalsA);
                }
            }
        }

        // Promediamos la posesión
        aggregatedStats.clubA.possessionAvg = Math.round(possessionSumA / headToHeadMatches.length);
        aggregatedStats.clubB.possessionAvg = Math.round(possessionSumB / headToHeadMatches.length);

        return aggregatedStats;

    } catch (error) {
        console.error(`Error en fetchAndAggregateStats para ${clubIdA} vs ${clubIdB}:`, error);
        return null;
    }
}

/**
 * Fetch the roster of a club and return player heights and positions.
 * @param {string} clubId EA Club ID
 * @param {string} platform EA Platform
 */
export async function fetchClubRosterHeights(clubId, platform = 'common-gen5') {
    try {
        const urlStats = `https://proclubs.ea.com/api/fc/members/stats?clubIds=${clubId}&platform=${platform}`;
        const resStats = await fetch(urlStats, { headers: EA_HEADERS }).catch(() => null);
        let members = [];
        if (resStats && resStats.ok) {
            const dataS = await resStats.json().catch(() => ({}));
            if (dataS.members) members = dataS.members;
        }

        const posMap = {
            0: 'POR', 1: 'DFD', 2: 'DFC', 3: 'DFI', 4: 'CAD', 5: 'CAI',
            6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
            11: 'EDD', 12: 'EDI', 13: 'SD', 14: 'DC'
        };

        const playersData = [];
        for (const member of members) {
            const posId = member.proPos;
            const posName = posMap[posId] || `POS ${posId}`;
            const height = member.proHeight || '?';
            
            playersData.push({
                name: member.name,
                posName,
                posId: parseInt(posId) || 99,
                height
            });
        }

        playersData.sort((a, b) => a.posId - b.posId);
        return playersData;
    } catch (error) {
        console.error('Error fetching club roster heights:', error);
        return [];
    }
}

