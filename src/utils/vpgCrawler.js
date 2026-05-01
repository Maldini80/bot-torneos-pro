import axios from 'axios';

const VPG_API_BASE = 'https://api.virtualprogaming.com/v1';
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
};

/**
 * Sincroniza la lista de ligas de la comunidad VPG España
 * @returns {Promise<Array>} Lista de ligas con su id, title y slug
 */
export async function fetchVpgSpainLeagues() {
    try {
        // La URL de ligas para la comunidad VPG España
        // Puede variar si la API cambia, pero basado en la web app, suele ser:
        const response = await axios.get(`${VPG_API_BASE}/communities/VPG-espana-ps5/leagues`, { headers: HEADERS });
        
        // Devolvemos la lista mapeada. Asumimos la estructura típica de VPG
        if (response.data && response.data.data) {
            return response.data.data.map(league => ({
                id: league.id,
                title: league.title || league.name,
                slug: league.slug
            }));
        }
        
        // Si no funciona lo anterior, intentar buscar por region si existe endpoint
        return [];
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
        // Mapeo de grupo de posicion al id de posicion en VPG (basado en su UI)
        // La API puede usar query params como ?type=weekly&position=Cb
        // Basándonos en la UI: 'Gk', 'Cb', 'Fb', 'Cdm', 'Cam', 'Wingers', 'Strikers'
        
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

        // La URL para los leaderboards (puede ser id o slug dependiendo de la API exacta)
        // Intentaremos con slug primero que es lo que aparece en la URL web
        const url = `${VPG_API_BASE}/league/${leagueSlug}/stats`;
        const params = {
            type: type, // 'weekly' o 'all'
            position: vpgPos,
            limit: 50, // Traer suficientes para filtrar
            sort: 'match_rating' // Asegurarnos de ordenar por rating
        };

        const response = await axios.get(url, { headers: HEADERS, params });
        
        if (response.data && response.data.data) {
            return response.data.data;
        }

        return [];
    } catch (error) {
        console.error(`[VPG Crawler] Error fetching leaderboard for ${leagueSlug} - ${positionGroup}:`, error.message);
        throw error;
    }
}
