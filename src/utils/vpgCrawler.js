// Usamos fetch nativo de Node.js (no axios) para evitar bucles de redirección con Cloudflare
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

/**
 * Hace un fetch con reintentos a múltiples URLs
 */
async function vpgFetch(urls) {
    if (typeof urls === 'string') urls = [urls];
    let lastError = null;
    for (const url of urls) {
        try {
            console.log(`[VPG Crawler] Trying: ${url}`);
            const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
            console.log(`[VPG Crawler] Response: ${res.status} ${res.statusText}`);
            if (!res.ok) {
                console.log(`[VPG Crawler] Non-OK response from ${url}: ${res.status}`);
                continue;
            }
            const data = await res.json();
            return data;
        } catch (e) {
            lastError = e;
            console.log(`[VPG Crawler] Failed ${url}: ${e.message}`);
        }
    }
    throw lastError || new Error('All VPG API URLs failed');
}

/**
 * Extrae un array de datos de una respuesta que puede tener varias formas
 */
function extractArray(rawData) {
    if (Array.isArray(rawData)) return rawData;
    if (rawData && Array.isArray(rawData.data)) return rawData.data;
    if (rawData && Array.isArray(rawData.results)) return rawData.results;
    if (rawData && typeof rawData === 'object') {
        // Filtrar solo items que parezcan ligas/jugadores (tienen id)
        const values = Object.values(rawData).filter(v => v && typeof v === 'object' && v.id);
        if (values.length > 0) return values;
    }
    return [];
}

/**
 * Sincroniza la lista de ligas de la comunidad VPG España
 * @returns {Promise<Array>} Lista de ligas con su id, title y slug
 */
export async function fetchVpgSpainLeagues() {
    try {
        // Probamos múltiples endpoints: el proxy del frontend y la API directa
        const urls = [
            'https://virtualprogaming.com/api/communities/vpg-spain/leagues/',
            'https://api.virtualprogaming.com/public/communities/vpg-spain/leagues/',
            'https://api.virtualprogaming.com/v1/communities/vpg-spain/leagues/',
        ];

        const rawData = await vpgFetch(urls);
        const leagues = extractArray(rawData);

        console.log(`[VPG Crawler] Raw response type: ${typeof rawData}, isArray: ${Array.isArray(rawData)}`);
        if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
            console.log(`[VPG Crawler] Raw response keys: ${Object.keys(rawData).join(', ')}`);
        }
        console.log(`[VPG Crawler] Found ${leagues.length} leagues`);
        if (leagues.length > 0) {
            console.log(`[VPG Crawler] First league sample:`, JSON.stringify(leagues[0]).substring(0, 300));
        }

        return leagues.map(league => ({
            id: league.id,
            title: league.title || league.name || league.league_name || 'Unknown',
            slug: league.slug || league.league_slug || ''
        }));
    } catch (error) {
        console.error('[VPG Crawler] Error fetching leagues:', error.message);
        throw error;
    }
}

/**
 * Obtiene el leaderboard de una liga por slug y posición
 * @param {string} leagueSlug - Slug de la liga (ej. superliga-spain-b)
 * @param {string} positionGroup - 'gk', 'cb', 'cdm', 'cam', 'wingers', 'strikers'
 * @param {string} type - 'weekly' o 'all'
 * @returns {Promise<Array>} Lista de jugadores ordenados
 */
export async function fetchVpgLeaderboard(leagueSlug, positionGroup, type = 'weekly') {
    try {
        const posMap = {
            'gk': 'Gk',
            'cb': 'Cb',
            'cdm': 'Cdm',
            'cam': 'Cam',
            'wingers': 'Wingers',
            'strikers': 'Strikers'
        };

        const vpgPos = posMap[positionGroup];
        if (!vpgPos) throw new Error(`Invalid position group: ${positionGroup}`);

        const queryParams = new URLSearchParams({
            type: type,
            position: vpgPos,
            limit: '50',
            sort: 'match_rating'
        }).toString();

        const urls = [
            `https://virtualprogaming.com/api/leagues/${leagueSlug}/leaderboard?${queryParams}`,
            `https://virtualprogaming.com/api/league/${leagueSlug}/stats?${queryParams}`,
            `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?${queryParams}`,
        ];

        const rawData = await vpgFetch(urls);
        return extractArray(rawData);
    } catch (error) {
        console.error(`[VPG Crawler] Error fetching leaderboard for ${leagueSlug} - ${positionGroup}:`, error.message);
        throw error;
    }
}
