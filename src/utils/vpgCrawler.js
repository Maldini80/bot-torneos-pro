import axios from 'axios';

const VPG_API_BASE = 'https://api.virtualprogaming.com/public';
const VPG_COMMUNITY_SLUG = 'vpg-spain';
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://virtualprogaming.com',
    'Referer': 'https://virtualprogaming.com/'
};

/**
 * Sincroniza la lista de ligas de la comunidad VPG España
 * @returns {Promise<Array>} Lista de ligas con su id, title y slug
 */
export async function fetchVpgSpainLeagues() {
    try {
        const url = `${VPG_API_BASE}/communities/${VPG_COMMUNITY_SLUG}/leagues`;
        console.log(`[VPG Crawler] Fetching leagues from: ${url}`);
        const response = await axios.get(url, { headers: HEADERS });
        
        // La API puede devolver un array directamente o un objeto con .data / .results
        const rawData = response.data;
        let leagues = [];

        if (Array.isArray(rawData)) {
            leagues = rawData;
        } else if (rawData && Array.isArray(rawData.data)) {
            leagues = rawData.data;
        } else if (rawData && Array.isArray(rawData.results)) {
            leagues = rawData.results;
        } else if (rawData && typeof rawData === 'object') {
            // Puede ser un objeto con keys numéricas
            leagues = Object.values(rawData);
        }

        console.log(`[VPG Crawler] Raw response keys: ${Object.keys(rawData || {}).join(', ')}`);
        console.log(`[VPG Crawler] Found ${leagues.length} leagues`);

        return leagues.map(league => ({
            id: league.id,
            title: league.title || league.name || league.league_name || 'Unknown',
            slug: league.slug || league.league_slug || ''
        }));
    } catch (error) {
        console.error('[VPG Crawler] Error fetching leagues:', error.message);
        if (error.response) {
            console.error(`[VPG Crawler] Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data).substring(0, 200));
        }
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

        // Intentar con /public/ primero, luego /v1/ como fallback
        const urls = [
            `${VPG_API_BASE}/leagues/${leagueSlug}/leaderboard`,
            `${VPG_API_BASE}/league/${leagueSlug}/stats`,
            `https://api.virtualprogaming.com/v1/leagues/${leagueSlug}/leaderboard`
        ];

        const params = {
            type: type,
            position: vpgPos,
            limit: 50,
            sort: 'match_rating'
        };

        let lastError = null;
        for (const url of urls) {
            try {
                console.log(`[VPG Crawler] Trying leaderboard: ${url} with position=${vpgPos}, type=${type}`);
                const response = await axios.get(url, { headers: HEADERS, params });
                
                const rawData = response.data;
                if (Array.isArray(rawData)) return rawData;
                if (rawData && Array.isArray(rawData.data)) return rawData.data;
                if (rawData && Array.isArray(rawData.results)) return rawData.results;
                if (rawData && typeof rawData === 'object') return Object.values(rawData);
                return [];
            } catch (e) {
                lastError = e;
                console.log(`[VPG Crawler] URL ${url} failed: ${e.message}`);
                continue;
            }
        }
        
        throw lastError;
    } catch (error) {
        console.error(`[VPG Crawler] Error fetching leaderboard for ${leagueSlug} - ${positionGroup}:`, error.message);
        throw error;
    }
}
