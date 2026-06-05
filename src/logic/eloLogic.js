// src/logic/eloLogic.js
// Módulo de cálculo y gestión de ELO basado en clasificación VPG.

import { getBotSettings, getDb } from '../../database.js';
import { fetchVpgSpainLeagues } from '../utils/vpgCrawler.js';

const SUPERLIGA_SLUGS = ['superliga-spain-a', 'superliga-spain-b'];
const DIAMOND_CUTOFF = 6; // Top 6 posiciones son DIAMOND

// Emojis y orden de las ligas
export const LEAGUE_EMOJIS = {
    DIAMOND: '💎',
    GOLD: '👑',
    SILVER: '⚙️',
    BRONZE: '🥉'
};

export const LEAGUE_ORDER = ['DIAMOND', 'GOLD', 'SILVER', 'BRONZE'];

// Nivel de división para el tier SILVER (mismo nivel = misma importancia)
const DIVISION_LEVEL = {
    'segunda-division-a-spain': 1,
    'segunda-division-b-spain': 1,
    'tercera-division-a-spain': 2,
    'tercera-division-b-spain': 2,
    'cuarta-division-a-spain': 3,
    'cuarta-division-b-spain': 3,
    'quinta-division-a-spain': 4,
    'quinta-division-b-spain': 4,
    'quinta-division-c': 4,
    'quinta-division-d': 4,
};

// Orden de grupo dentro del mismo nivel (A=0, B=1, C=2, D=3)
const GROUP_ORDER = {
    'segunda-division-a-spain': 0, 'segunda-division-b-spain': 1,
    'tercera-division-a-spain': 0, 'tercera-division-b-spain': 1,
    'cuarta-division-a-spain': 0, 'cuarta-division-b-spain': 1,
    'quinta-division-a-spain': 0, 'quinta-division-b-spain': 1,
    'quinta-division-c': 2, 'quinta-division-d': 3,
};

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

/**
 * Devuelve la liga correspondiente según el ELO actual
 */
export function getLeagueByElo(elo) {
    if (elo >= 1550) return 'DIAMOND';
    if (elo >= 1300) return 'GOLD';
    if (elo >= 1000) return 'SILVER';
    return 'BRONZE';
}

/**
 * Obtiene la clasificación de una liga VPG desde la API pública.
 * @param {string} slug - Slug de la liga (ej. 'superliga-spain-a')
 * @returns {Promise<Array>} Array de equipos ordenados por posición
 */
async function fetchVpgTable(slug) {
    const url = `https://api.virtualprogaming.com/public/leagues/${slug}/table/`;
    try {
        console.log(`[ELO-VPG] Fetching table: ${url}`);
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
        if (!res.ok) {
            console.warn(`[ELO-VPG] Non-OK response for ${slug}: ${res.status}`);
            return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    } catch (e) {
        console.error(`[ELO-VPG] Error fetching table for ${slug}: ${e.message}`);
        return [];
    }
}

/**
 * Calcula un ELO equidistante dentro de un rango para N equipos.
 * El equipo en index 0 recibe maxElo, el último recibe minElo.
 */
function equidistantElo(index, total, maxElo, minElo) {
    if (total <= 1) return maxElo;
    return Math.round(maxElo - (index * (maxElo - minElo) / Math.max(total - 1, 1)));
}

/**
 * Recalcula el ELO de todos los equipos a partir de la clasificación VPG.
 * Clasifica en tiers DIAMOND/GOLD/SILVER/BRONZE y distribuye ELO equidistante.
 * @returns {Promise<{success: boolean, updated: number, summary: Array}>}
 */
export async function recalculateAllEloFromVpg() {
    console.log('[ELO-VPG] Iniciando recálculo masivo de ELO desde VPG...');

    // 1. Obtener la lista de ligas de VPG España
    const leagues = await fetchVpgSpainLeagues();

    // 2. Descargar clasificaciones de todas las ligas
    const standingsBySlug = {};
    for (const league of leagues) {
        standingsBySlug[league.slug] = await fetchVpgTable(league.slug);
    }

    // 3. Clasificar equipos en tiers
    const diamond = []; // { team_slug, team_name, leagueSlug, position }
    const gold = [];
    const silver = [];

    for (const league of leagues) {
        const slug = league.slug;
        const standings = standingsBySlug[slug] || [];
        const isSuperliga = SUPERLIGA_SLUGS.includes(slug);

        standings.forEach((entry, index) => {
            const position = index + 1;
            const item = {
                team_slug: entry.team_slug,
                team_name: entry.team_name,
                leagueSlug: slug,
                position,
            };

            if (isSuperliga) {
                if (position <= DIAMOND_CUTOFF) {
                    diamond.push(item);
                } else {
                    gold.push(item);
                }
            } else {
                silver.push(item);
            }
        });
    }

    // 4. Ordenar cada tier
    // IMPORTANTE: Los grupos A y B (y C, D) del mismo nivel son IGUALES.
    // Se ordena por POSICIÓN primero, luego por grupo como desempate.

    // DIAMOND: posición primero, luego grupo (A antes que B)
    diamond.sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return SUPERLIGA_SLUGS.indexOf(a.leagueSlug) - SUPERLIGA_SLUGS.indexOf(b.leagueSlug);
    });

    // GOLD: misma lógica
    gold.sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return SUPERLIGA_SLUGS.indexOf(a.leagueSlug) - SUPERLIGA_SLUGS.indexOf(b.leagueSlug);
    });

    // SILVER: nivel de división primero, luego posición, luego grupo
    silver.sort((a, b) => {
        const levelA = DIVISION_LEVEL[a.leagueSlug] || 99;
        const levelB = DIVISION_LEVEL[b.leagueSlug] || 99;
        if (levelA !== levelB) return levelA - levelB;
        if (a.position !== b.position) return a.position - b.position;
        const groupA = GROUP_ORDER[a.leagueSlug] ?? 99;
        const groupB = GROUP_ORDER[b.leagueSlug] ?? 99;
        return groupA - groupB;
    });

    // 5. Asignar ELO equidistante por nivel de división y posición (intercalando grupos)
    // De modo que el 1º del grupo A y el 1º del grupo B tengan la misma puntuación máxima,
    // el 2º del A la misma que el 2º del B, etc.

    // DIAMOND: posiciones 1 a 6 (DIAMOND_CUTOFF)
    const diamondElos = diamond.map(item => ({
        ...item,
        elo: Math.round(2000 - ((item.position - 1) * (2000 - 1550) / 5)),
        league: 'DIAMOND',
    }));

    // GOLD: posiciones 7+ de Superliga
    const maxGoldPosition = Math.max(...gold.map(item => item.position), 7);
    const goldRange = Math.max(maxGoldPosition - 7, 1);
    const goldElos = gold.map(item => ({
        ...item,
        elo: Math.round(1549 - ((item.position - 7) * (1549 - 1300) / goldRange)),
        league: 'GOLD',
    }));

    // SILVER: Segunda (L1), Tercera (L2), Cuarta (L3), Quinta (L4)
    const silverElos = [];
    for (const item of silver) {
        const lev = DIVISION_LEVEL[item.leagueSlug] || 4; // Por defecto Quinta
        const maxL = 1300 - (lev - 1) * 75 - 1;
        const minL = 1300 - lev * 75;
        const lvlTeams = silver.filter(it => (DIVISION_LEVEL[it.leagueSlug] || 4) === lev);
        const maxLPos = Math.max(...lvlTeams.map(it => it.position), 1);
        const rangeL = Math.max(maxLPos - 1, 1);
        
        const elo = Math.round(maxL - ((item.position - 1) * (maxL - minL) / rangeL));
        silverElos.push({
            ...item,
            elo,
            league: 'SILVER',
        });
    }

    // Crear un mapa de team_slug -> { elo, league } para búsqueda rápida
    const vpgEloMap = new Map();
    for (const item of [...diamondElos, ...goldElos, ...silverElos]) {
        vpgEloMap.set(item.team_slug, { elo: item.elo, league: item.league, team_name: item.team_name });
    }

    // Crear un mapa de leagueSlug -> tier para equipos que no matcheen por team_slug
    // pero sí tengan vpgLeagueSlug asignado en la DB
    const leagueSlugToTier = new Map();
    for (const league of leagues) {
        if (SUPERLIGA_SLUGS.includes(league.slug)) {
            // No podemos saber la posición sin match exacto, asignar GOLD como fallback
            leagueSlugToTier.set(league.slug, 'SUPERLIGA');
        } else {
            leagueSlugToTier.set(league.slug, 'SILVER');
        }
    }

    // 6. Actualizar la base de datos
    const testDb = getDb('test');
    const allTeams = await testDb.collection('teams').find({}).toArray();

    let updated = 0;
    const summary = [];

    for (const team of allTeams) {
        let newElo;
        let newLeague;
        let matched = false;

        // Intentar matchear por vpgTeamSlug
        if (team.vpgTeamSlug && vpgEloMap.has(team.vpgTeamSlug)) {
            const vpgData = vpgEloMap.get(team.vpgTeamSlug);
            newElo = vpgData.elo;
            newLeague = vpgData.league;
            matched = true;
        }

        // Si no matcheó por team_slug, intentar por vpgLeagueSlug (fallback genérico)
        if (!matched && team.vpgLeagueSlug) {
            const tier = leagueSlugToTier.get(team.vpgLeagueSlug);
            if (tier === 'SUPERLIGA') {
                // Está en superliga pero no lo encontramos en standings → GOLD mínimo
                newElo = 1300;
                newLeague = 'GOLD';
            } else if (tier === 'SILVER') {
                // Está en divisiones inferiores pero no lo encontramos → SILVER medio
                newElo = 1150;
                newLeague = 'SILVER';
            } else {
                // vpgLeagueSlug no reconocido → BRONZE
                newElo = 650;
                newLeague = 'BRONZE';
            }
            matched = true;
        }

        // Sin vpgLeagueSlug → BRONZE
        if (!matched) {
            newElo = 650;
            newLeague = 'BRONZE';
        }

        const oldElo = team.elo || 1000;
        const delta = newElo - oldElo;

        await testDb.collection('teams').updateOne(
            { _id: team._id },
            {
                $set: { elo: newElo, league: newLeague },
                $push: {
                    eloHistory: {
                        $each: [{
                            date: new Date(),
                            oldElo,
                            newElo,
                            delta,
                            reason: 'vpg_classification',
                        }],
                        $slice: -100,
                    },
                },
            }
        );

        summary.push({
            name: team.name || team.nombre || 'Equipo desconocido',
            oldElo,
            newElo,
            delta,
            league: newLeague,
        });
        updated++;
    }

    console.log(`[ELO-VPG] Recálculo completado. ${updated} equipos actualizados.`);
    return { success: true, updated, summary };
}

/**
 * Función auxiliar para ordenar equipos con todos los criterios de desempate
 */
function sortTeamsForRanking(a, b, tournamentState) {
    if ((b.stats?.pts || 0) !== (a.stats?.pts || 0)) return (b.stats?.pts || 0) - (a.stats?.pts || 0);

    // --- TIE-BREAKS PARA SISTEMA SUIZO ---
    if (tournamentState.config?.formatId === 'flexible_league' && tournamentState.config?.leagueMode === 'custom_rounds') {
        if ((b.stats?.buchholz || 0) !== (a.stats?.buchholz || 0)) return (b.stats?.buchholz || 0) - (a.stats?.buchholz || 0);
    }
    // -------------------------------------

    if ((b.stats?.dg || 0) !== (a.stats?.dg || 0)) return (b.stats?.dg || 0) - (a.stats?.dg || 0);
    if ((b.stats?.gf || 0) !== (a.stats?.gf || 0)) return (b.stats?.gf || 0) - (a.stats?.gf || 0);

    // --- ENFRENTAMIENTO DIRECTO ---
    let enfrentamiento = null;
    if (tournamentState.structure?.calendario) {
        for (const groupName in tournamentState.structure.calendario) {
            enfrentamiento = tournamentState.structure.calendario[groupName]?.find(p => p.resultado && ((p.equipoA?.id === a.id && p.equipoB?.id === b.id) || (p.equipoA?.id === b.id && p.equipoB?.id === a.id)));
            if (enfrentamiento) break;
        }
    }
    if (enfrentamiento) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) { if (golesA > golesB) return -1; if (golesB > golesA) return 1; }
        else { if (golesB > golesA) return -1; if (golesA > golesB) return 1; }
    }

    if ((b.stats?.pg || 0) !== (a.stats?.pg || 0)) return (b.stats?.pg || 0) - (a.stats?.pg || 0);

    if (!a.nombre || !b.nombre) {
        return (!a.nombre ? 1 : -1);
    }
    return a.nombre.localeCompare(b.nombre);
}
