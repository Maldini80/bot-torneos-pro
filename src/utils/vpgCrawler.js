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

// =====================================================================
// Ligas de VPG España PS5/Crossplay - Extraídas de virtualprogaming.com
// Última actualización: 2026-05-01
// Estas ligas raramente cambian. Si VPG añade/elimina alguna,
// actualizar esta lista manualmente.
// =====================================================================
const VPG_SPAIN_LEAGUES = [
    { id: 1, title: 'SUPERLIGA ESPAÑA IMPACT GAME A', slug: 'superliga-spain-a' },
    { id: 2, title: 'SUPERLIGA ESPAÑA IMPACT GAME B', slug: 'superliga-spain-b' },
    { id: 3, title: 'SEGUNDA DIVISION A', slug: 'segunda-division-a-spain' },
    { id: 4, title: 'SEGUNDA DIVISION B', slug: 'segunda-division-b-spain' },
    { id: 5, title: 'TERCERA DIVISION A', slug: 'tercera-division-a-spain' },
    { id: 6, title: 'TERCERA DIVISION B', slug: 'tercera-division-b-spain' },
    { id: 7, title: 'CUARTA DIVISION A', slug: 'cuarta-division-a-spain' },
    { id: 8, title: 'CUARTA DIVISION B', slug: 'cuarta-division-b-spain' },
    { id: 9, title: 'QUINTA DIVISION A', slug: 'quinta-division-a-spain' },
    { id: 10, title: 'QUINTA DIVISION B', slug: 'quinta-division-b-spain' },
    { id: 11, title: 'QUINTA DIVISION C', slug: 'quinta-division-c-spain' },
    { id: 12, title: 'QUINTA DIVISION D', slug: 'quinta-division-d-spain' },
];

/**
 * Sincroniza la lista de ligas de la comunidad VPG España.
 * Usa la lista hardcodeada como fuente principal ya que Cloudflare
 * bloquea las peticiones directas del servidor a api.virtualprogaming.com.
 * @returns {Promise<Array>} Lista de ligas con su id, title y slug
 */
export async function fetchVpgSpainLeagues() {
    console.log(`[VPG Crawler] Cargando ${VPG_SPAIN_LEAGUES.length} ligas de VPG España (lista local)`);
    return VPG_SPAIN_LEAGUES;
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
        // VPG API valores permitidos: 'top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers', 'top_scorer'
        const posMap = {
            'gk': 'top_gk',
            'cb': 'top_cb',
            'cdm': 'top_cdm',
            'cam': 'top_cam',
            'wingers': 'top_wingers',
            'strikers': 'top_strikers'
        };

        const vpgPos = posMap[positionGroup];
        if (!vpgPos) throw new Error(`Invalid position group: ${positionGroup}`);

        // Probamos varias combinaciones de parámetros
        // La API requiere "leaderboard" como nombre del parámetro (no "position")
        const paramSets = [
            { leaderboard: vpgPos, type: type },
            { leaderboard: vpgPos },
        ];

        let lastError = null;
        for (const params of paramSets) {
            const queryParams = new URLSearchParams(params).toString();
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?${queryParams}`;
            try {
                console.log(`[VPG Crawler] Trying leaderboard: ${url}`);
                const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
                console.log(`[VPG Crawler] Response: ${res.status} ${res.statusText}`);
                if (!res.ok) {
                    const errorText = await res.text().catch(() => '');
                    console.log(`[VPG Crawler] Error body: ${errorText.substring(0, 200)}`);
                    continue;
                }
                const data = await res.json();
                const players = extractArray(data);
                if (players.length > 0) {
                    console.log(`[VPG Crawler] ✅ Got ${players.length} players for ${positionGroup}`);
                    console.log(`[VPG Crawler] First player sample:`, JSON.stringify(players[0]).substring(0, 300));
                    return players;
                }
            } catch (e) {
                lastError = e;
                console.log(`[VPG Crawler] Failed: ${e.message}`);
            }
        }

        throw lastError || new Error(`No data found for ${positionGroup}`);
    } catch (error) {
        console.error(`[VPG Crawler] Error fetching leaderboard for ${leagueSlug} - ${positionGroup}:`, error.message);
        throw error;
    }
}
