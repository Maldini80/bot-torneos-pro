import { fetchVpgLeaderboard } from '../utils/vpgCrawler.js';

/**
 * Calcula el Mejor 11 (3-5-2) a partir de los datos de VPG.
 * @param {string} leagueSlug 
 * @param {string} type 'weekly' o 'all'
 * @param {string[]} excludedTeams Nombres de equipos a excluir
 */
export async function calculateVpgBest11(leagueSlug, type, excludedTeams = []) {
    const isExcluded = (teamName) => {
        if (!teamName) return false;
        return excludedTeams.some(excluded => teamName.toLowerCase().includes(excluded.toLowerCase()));
    };

    const getTopValidPlayers = async (position, count) => {
        try {
            const players = await fetchVpgLeaderboard(leagueSlug, position, type);
            // player object typical structure: { player: { username }, team: { name, logo_url }, stats: { match_rating } }
            // Filtrar excluidos y ordenar por match_rating descendente
            const valid = players
                .filter(p => !isExcluded(p.team?.name))
                .sort((a, b) => (b.stats?.match_rating || 0) - (a.stats?.match_rating || 0));
            return valid.slice(0, count);
        } catch (e) {
            console.error(`Error procesando posición ${position}:`, e.message);
            return [];
        }
    };

    // 1 GK
    const gks = await getTopValidPlayers('gk', 1);

    // 3 CB (Defensas)
    const cbs = await getTopValidPlayers('cb', 3);

    // 5 MEDIOS (2 CDM, 1 CAM, 2 Wingers)
    // Pedimos 3 de CDM, 3 de CAM y escogemos los 3 mejores absolutos combinados.
    // El usuario especificó: "Wingers son los CARR. CDM y CAM son medios osea los 3 de esas dos posiciones"
    const cdms = await getTopValidPlayers('cdm', 5);
    const cams = await getTopValidPlayers('cam', 5);
    
    const allCenterMids = [...cdms, ...cams]
        .sort((a, b) => (b.stats?.match_rating || 0) - (a.stats?.match_rating || 0));
    
    // Evitar duplicados (un jugador podría estar en ambas listas si VPG es raro, aunque no debería)
    const uniqueCenterMids = [];
    const seenNames = new Set();
    for (const p of allCenterMids) {
        if (!seenNames.has(p.player?.username)) {
            seenNames.add(p.player?.username);
            uniqueCenterMids.push(p);
        }
    }
    const selectedCenterMids = uniqueCenterMids.slice(0, 3);

    // 2 Wingers (CARR)
    const wingers = await getTopValidPlayers('wingers', 2);

    const mids = [...selectedCenterMids, ...wingers];

    // 2 STRIKERS (Delanteros)
    const strikers = await getTopValidPlayers('strikers', 2);

    return {
        gk: gks,
        def: cbs,
        mid: mids,
        fwd: strikers
    };
}
