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

        const posMapNum = {
            0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
            6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
            11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC'
        };

        const resolvePos = (posRaw, archetypeid) => {
            if (!isNaN(posRaw) && posMapNum[posRaw] !== undefined) return posMapNum[posRaw];
            const p = String(posRaw || '').toLowerCase();
            if (p === 'goalkeeper') return 'POR';
            if (p === 'forward' || p === 'attacker' || p === 'striker') return 'DC';
            if (p === 'defender' || p === 'centerback') return 'DFC';
            if (p === 'midfielder') { if (archetypeid == 10 || archetypeid == 12) return 'MI'; return 'MC'; }
            return posMapNum[posRaw] || posRaw || '???';
        };

        const aggregatePlayers = (targetClubPlayers, sourcePlayersData, teamGoalsAgainst) => {
            if (!sourcePlayersData) return;
            for (const [playerId, pData] of Object.entries(sourcePlayersData)) {
                const pName = pData.playername || playerId;
                
                const resolvedPos = resolvePos(pData.pos, pData.archetypeid);

                if (!targetClubPlayers[pName]) {
                    targetClubPlayers[pName] = {
                        name: pName,
                        pos: resolvedPos,
                        goals: 0,
                        assists: 0,
                        ratingSum: 0,
                        saves: 0,
                        gamesPlayed: 0,
                        cleanSheets: 0,
                        goalsConceded: 0,
                        mom: 0, // Man of the match
                        passesMade: 0,
                        passAttempts: 0,
                        tacklesMade: 0,
                        tackleAttempts: 0,
                        shots: 0
                    };
                }
                
                targetClubPlayers[pName].goals += parseInt(pData.goals) || 0;
                targetClubPlayers[pName].assists += parseInt(pData.assists) || 0;
                targetClubPlayers[pName].ratingSum += parseFloat(pData.rating) || 0;
                targetClubPlayers[pName].saves += parseInt(pData.saves) || 0;
                targetClubPlayers[pName].mom += parseInt(pData.mom) || 0;
                targetClubPlayers[pName].gamesPlayed += 1;
                targetClubPlayers[pName].passesMade += parseInt(pData.passesMade) || 0;
                targetClubPlayers[pName].passAttempts += parseInt(pData.passAttempts) || parseInt(pData.passesMade) || 0;
                targetClubPlayers[pName].tacklesMade += parseInt(pData.tacklesMade) || 0;
                targetClubPlayers[pName].tackleAttempts += parseInt(pData.tackleAttempts) || parseInt(pData.tacklesMade) || 0;
                targetClubPlayers[pName].shots += parseInt(pData.shots) || 0;
                
                const posLower = resolvedPos.toLowerCase();
                if (posLower.includes('goalkeeper') || posLower.includes('gk') || posLower === 'portero' || posLower === 'por') {
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

export async function fetchClubRosterHeights(clubId, platform = 'common-gen5') {
    try {
        console.log(`[EA Heights] Starting for clubId=${clubId}, platform=${platform}`);

        // Posiciones según EA FC en español
        const posMap = {
            0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
            6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
            11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC'
        };

        const favPosMap = {
            'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
            'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
            'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
            'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC',
            'striker': 'DC', 'winger': 'ED', 'wing': 'ED'
        };

        // Orden: Portero → Centrales → Laterales → Centro → Delanteros → Desconocido
        const posSortOrder = {
            'POR': 0,
            'DFC': 1,
            'LD': 2, 'LI': 3, 'CAD': 4, 'CAI': 5,
            'MCD': 6, 'MC': 7, 'MCO': 8, 'MD': 9, 'MI': 10,
            'ED': 11, 'EI': 12, 'MP': 13, 'DC': 14
        };

        // Strategy 1: Try members/career/stats (singular clubId)
        const endpoints = [
            `https://proclubs.ea.com/api/fc/members/stats?clubIds=${clubId}&platform=${platform}`,
            `https://proclubs.ea.com/api/fc/members/career/stats?clubIds=${clubId}&platform=${platform}`,
            `https://proclubs.ea.com/api/fc/members/stats?clubId=${clubId}&platform=${platform}`,
            `https://proclubs.ea.com/api/fc/members/career/stats?clubId=${clubId}&platform=${platform}`,
        ];

        for (const url of endpoints) {
            console.log(`[EA Heights] Trying: ${url}`);
            const res = await fetch(url, { headers: EA_HEADERS }).catch(() => null);
            if (res && res.ok) {
                const data = await res.json().catch(() => null);
                if (!data) continue;
                console.log(`[EA Heights] Success! Keys: ${Object.keys(data).join(', ')}`);

                let members = [];
                if (Array.isArray(data)) {
                    members = data;
                } else if (data.members && Array.isArray(data.members)) {
                    members = data.members;
                } else if (data[String(clubId)] && Array.isArray(data[String(clubId)])) {
                    members = data[String(clubId)];
                } else if (data[String(clubId)]?.members) {
                    members = data[String(clubId)].members;
                } else {
                    for (const val of Object.values(data)) {
                        if (Array.isArray(val) && val.length > 0) { members = val; break; }
                        if (val?.members && Array.isArray(val.members)) { members = val.members; break; }
                    }
                }

                if (members.length > 0) {
                    console.log(`[EA Heights] Found ${members.length} members from stats endpoint`);
                    console.log(`[EA Heights] Sample member keys: ${Object.keys(members[0]).join(', ')}`);
                    console.log(`[EA Heights] Sample member data: ${JSON.stringify(members[0]).substring(0, 500)}`);
                    const playersData = members.map(m => {
                        const rawFavPos = (m.favoritePosition || '').toLowerCase();
                        const resolvedPos = posMap[m.proPos] || favPosMap[rawFavPos] || (rawFavPos ? rawFavPos.toUpperCase().substring(0, 3) : '???');
                        const rawHeight = m.proHeight || m.height;
                        return {
                            name: m.name || m.playername || 'Desconocido',
                            posName: resolvedPos,
                            sortOrder: posSortOrder[resolvedPos] ?? 99,
                            height: rawHeight ? `${rawHeight} cm` : 'No disponible'
                        };
                    });
                    playersData.sort((a, b) => a.sortOrder - b.sortOrder);
                    return playersData;
                }
            } else if (res) {
                console.log(`[EA Heights] ${url} returned ${res.status}`);
            }
        }

        // Strategy 2: Fallback to match data - get last match players
        console.log('[EA Heights] Stats endpoints failed, falling back to match data...');
        const urlMatches = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubId}&platform=${platform}&matchType=friendlyMatch`;
        const resMatches = await fetch(urlMatches, { headers: EA_HEADERS }).catch(() => null);

        if (resMatches && resMatches.ok) {
            let matchData = await resMatches.json().catch(() => []);
            if (!Array.isArray(matchData)) matchData = Object.values(matchData || {});
            matchData.sort((a, b) => b.timestamp - a.timestamp);

            if (matchData.length > 0 && matchData[0].players && matchData[0].players[String(clubId)]) {
                const matchPlayers = matchData[0].players[String(clubId)];
                console.log(`[EA Heights] Found ${Object.keys(matchPlayers).length} players from last match`);

                const posNameMap = {
                    'goalkeeper': 'POR', 'defender': 'DFC', 'midfielder': 'MC',
                    'forward': 'DC', 'attacker': 'DC', 'wing': 'ED',
                    'centerBack': 'DFC', 'fullback': 'CAD', 'leftBack': 'DFI',
                    'rightBack': 'DFD', 'defensiveMidfield': 'MCD', 'centralMidfield': 'MC',
                    'attackingMidfield': 'MCO', 'striker': 'DC', 'winger': 'ED'
                };

                const playersData = Object.values(matchPlayers).map(p => {
                    const rawPos = (p.pos || '').toLowerCase();
                    let posName = 'JUG';
                    for (const [key, val] of Object.entries(posNameMap)) {
                        if (rawPos.includes(key)) { posName = val; break; }
                    }
                    return {
                        name: p.playername || 'Desconocido',
                        posName,
                        posId: 99,
                        height: p.proHeight || p.height || 'N/A (solo visible en stats)'
                    };
                });

                return playersData;
            }
        }

        console.log('[EA Heights] No data found from any source');
        return [];
    } catch (error) {
        console.error('[EA Heights] Error:', error);
        return [];
    }
}

