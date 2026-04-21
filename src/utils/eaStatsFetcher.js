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
        // matchType = gameType9 (partidos de liga/divisiones), gameType13 (amistosos)
        // Intentaremos traer el historial sin filtro restrictivo si es posible, o hacer dos peticiones.
        // Primero intentaremos traer el historial global o de gameType9.
        const url = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubIdA}&platform=${platform}&matchType=gameType9`;
        const response = await fetch(url, { headers: EA_HEADERS });
        
        if (!response.ok) {
            console.error(`Error fetching matches for ${clubIdA}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
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
                possessionAvg: 0
            },
            clubB: {
                goals: 0,
                goalsAgainst: 0,
                shots: 0,
                passesMade: 0,
                tacklesMade: 0,
                possessionAvg: 0
            }
        };

        let possessionSumA = 0;
        let possessionSumB = 0;

        for (const match of headToHeadMatches) {
            const statsA = match.clubs[String(clubIdA)];
            const statsB = match.clubs[String(clubIdB)];

            if (statsA && statsB) {
                aggregatedStats.clubA.goals += parseInt(statsA.goals) || 0;
                aggregatedStats.clubA.goalsAgainst += parseInt(statsA.goalsAgainst) || 0;
                aggregatedStats.clubA.shots += parseInt(statsA.shots) || 0;
                aggregatedStats.clubA.passesMade += parseInt(statsA.passesMade) || 0;
                aggregatedStats.clubA.tacklesMade += parseInt(statsA.tacklesMade) || 0;
                possessionSumA += parseFloat(statsA.possession) || 50;

                aggregatedStats.clubB.goals += parseInt(statsB.goals) || 0;
                aggregatedStats.clubB.goalsAgainst += parseInt(statsB.goalsAgainst) || 0;
                aggregatedStats.clubB.shots += parseInt(statsB.shots) || 0;
                aggregatedStats.clubB.passesMade += parseInt(statsB.passesMade) || 0;
                aggregatedStats.clubB.tacklesMade += parseInt(statsB.tacklesMade) || 0;
                possessionSumB += parseFloat(statsB.possession) || 50;
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
