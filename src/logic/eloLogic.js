import { ObjectId } from 'mongodb';
import { getBotSettings, getDb } from '../../database.js';
import { fetchVpgSpainLeagues } from '../utils/vpgCrawler.js';

const ELO_MIN = 0;

// Recompensas por defecto para Playoffs (calibradas según settings)
const DEFAULT_PLAYOFF_VALS = {
    champion: 45,
    runner_up: 24,
    semifinalist: 12,
    quarterfinalist: 5,
    round_of_16: -6,
    groups_top_half: -9,
    groups_bottom_half: -15
};

// Recompensas por defecto para Liga (calibradas según settings)
const DEFAULT_LEAGUE_VALS = {
    first: 36,
    second: 23,
    third: 12,
    top_half: 5,
    bottom_half: -11,
    last: -18
};

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

function isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    try {
        return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
    } catch {
        return false;
    }
}

/**
 * Función principal que se llama cuando un torneo finaliza para distribuir ELO
 */
export async function distributeTournamentElo(client, tournamentState) {
    if (!tournamentState) return { success: false, message: 'Torneo no proporcionado' };

    if (tournamentState.config?.requireElo === false) {
        console.log(`[ELO] Torneo ${tournamentState.shortId} tiene ELO desactivado (requireElo: false). Omitiendo distribución.`);
        return { success: true, message: 'Torneo con ELO desactivado' };
    }
    if (tournamentState.config?.isPaid) {
        console.log(`[ELO] Torneo de pago ${tournamentState.shortId} omitido para ELO.`);
        return { success: true, message: 'Torneo de pago omitido' };
    }
    if (tournamentState.shortId?.startsWith('draft-')) {
        console.log(`[ELO] Torneo Draft ${tournamentState.shortId} omitido para ELO.`);
        return { success: true, message: 'Torneo draft omitido' };
    }
    if (tournamentState.eloDistributed) {
        console.log(`[ELO] ELO ya fue distribuido previamente para ${tournamentState.shortId}`);
        return { success: true, message: 'ELO ya distribuido' };
    }

    const testDb = getDb('test');
    console.log(`[ELO] Calculando recompensas de final de torneo: ${tournamentState.shortId}...`);

    const settings = await getBotSettings();
    const configPlayoff = settings?.eloConfig?.playoff || DEFAULT_PLAYOFF_VALS;
    const configLeague = settings?.eloConfig?.league || DEFAULT_LEAGUE_VALS;

    const KNOCKOUT_ROUNDS = ['dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'];
    const hasPlayoffs = KNOCKOUT_ROUNDS.some(r => {
        const stage = tournamentState.structure?.eliminatorias?.[r];
        if (!stage) return false;
        if (Array.isArray(stage)) return stage.length > 0;
        return typeof stage === 'object';
    });

    let eloUpdates = {};
    let teamMetaMap = {};

    if (hasPlayoffs) {
        ({ eloUpdates, teamMetaMap } = calculatePlayoffElo(tournamentState, configPlayoff));
    } else {
        ({ eloUpdates, teamMetaMap } = calculateLeagueElo(tournamentState, configLeague));
    }

    if (Object.keys(eloUpdates).length === 0) {
        console.log(`[ELO] Sin equipos válidos para actualizar en ${tournamentState.shortId}.`);
        return { success: false, message: 'Sin equipos válidos' };
    }

    let modified = 0;
    const eloSummary = [];

    for (const [teamIdentifier, eloDelta] of Object.entries(eloUpdates)) {
        if (!teamIdentifier || String(teamIdentifier).startsWith('ghost')) continue;

        const meta = teamMetaMap[teamIdentifier] || {};
        const teamName = meta.nombre;
        const eaClubId = meta.eaClubId;
        const managerId = meta.managerId || teamIdentifier;

        let team = null;
        if (managerId) {
            team = await testDb.collection('teams').findOne({ managerId: String(managerId) });
        }
        if (!team && eaClubId) {
            team = await testDb.collection('teams').findOne({ eaClubId: String(eaClubId) });
        }
        if (!team && teamName) {
            team = await testDb.collection('teams').findOne({
                name: { $regex: new RegExp(`^${teamName.trim()}$`, 'i') }
            });
        }
        if (!team && isValidObjectId(teamIdentifier)) {
            team = await testDb.collection('teams').findOne({ _id: new ObjectId(teamIdentifier) });
        }

        if (!team) {
            console.warn(`[ELO] No se encontró el equipo en test.teams para ID: ${teamIdentifier} (${teamName})`);
            continue;
        }

        const oldElo = team.elo || 1000;
        const newEloRaw = oldElo + eloDelta;
        const finalElo = Math.max(ELO_MIN, newEloRaw);
        const newLeague = getLeagueByElo(finalElo);

        await testDb.collection('teams').updateOne(
            { _id: team._id },
            { 
                $set: { elo: finalElo, league: newLeague },
                $push: { 
                    eloHistory: { 
                        $each: [{
                            date: new Date(),
                            oldElo,
                            newElo: finalElo,
                            delta: eloDelta,
                            reason: 'tournament_end',
                            tournamentShortId: tournamentState.shortId
                        }], 
                        $slice: -100 
                    } 
                }
            }
        );

        eloSummary.push({ 
            name: team.name || team.nombre || teamName || `Team ${teamIdentifier.substring(0, 4)}`, 
            delta: eloDelta, 
            newElo: finalElo, 
            newLeague 
        });
        modified++;
    }

    // Marcar el torneo en la base de datos principal para no repetir la distribución
    const tournamentDb = getDb();
    await tournamentDb.collection('tournaments').updateOne(
        { _id: tournamentState._id },
        { $set: { eloDistributed: true } }
    );

    // Enviar notificación a Discord con la tabla de cambios
    if (modified > 0 && client) {
        try {
            const { EmbedBuilder } = await import('discord.js');
            const { CHANNELS } = await import('../../config.js');

            eloSummary.sort((a, b) => b.delta - a.delta);

            const embed = new EmbedBuilder()
                .setTitle(`📊 Reparto ELO: ${tournamentState.nombre || 'Torneo'}`)
                .setColor('#00f6ff')
                .setFooter({ text: 'El ELO global ha sido actualizado.' })
                .setTimestamp();

            let tableString = '```\nEQUIPO                | PUNTOS  | NUEVA LIGA\n';
            tableString += '----------------------|---------|-----------\n';

            for (const t of eloSummary) {
                const deltaStr = t.delta > 0 ? `+${t.delta}` : `${t.delta}`;
                const namePad = (t.name || 'Equipo').padEnd(21).substring(0, 21);
                const deltaPad = deltaStr.padStart(7);
                const emoji = LEAGUE_EMOJIS[t.newLeague] || '';
                tableString += `${namePad} | ${deltaPad} | ${emoji} ${t.newLeague}\n`;
            }
            tableString += '```';

            embed.setDescription(`Al finalizar este evento, el sistema ha repartido los puntos de ELO según el resultado de cada equipo:\n\n${tableString}`);

            if (tournamentState.discordChannelIds?.infoChannelId) {
                const infoChannel = await client.channels.fetch(tournamentState.discordChannelIds.infoChannelId).catch(() => null);
                if (infoChannel) {
                    await infoChannel.send({ embeds: [embed] });
                }
            }

            if (CHANNELS?.TOURNAMENTS_STATUS) {
                const statusChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_STATUS).catch(() => null);
                if (statusChannel && statusChannel.id !== tournamentState.discordChannelIds?.infoChannelId) {
                    await statusChannel.send({ embeds: [embed] });
                }
            }
        } catch (e) {
            console.error('[ELO] Error al enviar notificación pública de ELO:', e.message);
        }
    }

    console.log(`[ELO] Se actualizó el ELO de ${modified} equipos para el torneo ${tournamentState.shortId}.`);
    return { success: true, teamsUpdated: modified };
}

/**
 * Calcula puntos ELO según la ronda máxima alcanzada en Playoffs.
 */
function calculatePlayoffElo(tournamentState, playoffVals) {
    let teamsRounds = {};
    let teamMetaMap = {};

    const rondas = ['dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'];

    // 1. Recolectar todos los equipos de la fase de grupos (si existe)
    if (tournamentState.structure?.grupos) {
        for (const gName in tournamentState.structure.grupos) {
            const equipos = tournamentState.structure.grupos[gName].equipos || [];
            for (const eq of equipos) {
                if (eq.id && !String(eq.id).startsWith('ghost')) {
                    teamsRounds[eq.id] = 'grupos';
                    teamMetaMap[eq.id] = {
                        nombre: eq.nombre || eq.name,
                        eaClubId: eq.eaClubId,
                        managerId: eq.managerId || eq.capitanId || eq.id
                    };
                }
            }
        }
    }

    // 2. Escanear las eliminatorias para ver hasta dónde llegó cada uno
    const elims = tournamentState.structure?.eliminatorias || {};

    let highestRound = null;
    for (const r of [...rondas].reverse()) {
        const stage = elims[r];
        if (stage && (Array.isArray(stage) ? stage.length > 0 : typeof stage === 'object')) {
            highestRound = r;
            break;
        }
    }

    for (const ronda of rondas) {
        if (!elims[ronda]) continue;
        const matches = Array.isArray(elims[ronda]) ? elims[ronda] : [elims[ronda]];
        for (const m of matches) {
            if (!m || !m.equipoA || !m.equipoB) continue;

            const idA = m.equipoA.id || m.equipoA._id || m.equipoA.capitanId;
            const idB = m.equipoB.id || m.equipoB._id || m.equipoB.capitanId;

            if (idA && !String(idA).startsWith('ghost')) {
                teamsRounds[idA] = ronda;
                if (!teamMetaMap[idA]) {
                    teamMetaMap[idA] = {
                        nombre: m.equipoA.nombre || m.equipoA.name,
                        eaClubId: m.equipoA.eaClubId,
                        managerId: m.equipoA.managerId || m.equipoA.capitanId || idA
                    };
                }
            }
            if (idB && !String(idB).startsWith('ghost')) {
                teamsRounds[idB] = ronda;
                if (!teamMetaMap[idB]) {
                    teamMetaMap[idB] = {
                        nombre: m.equipoB.nombre || m.equipoB.name,
                        eaClubId: m.equipoB.eaClubId,
                        managerId: m.equipoB.managerId || m.equipoB.capitanId || idB
                    };
                }
            }

            if (m.resultado) {
                const [gA, gB] = m.resultado.split('-').map(Number);
                if (!isNaN(gA) && !isNaN(gB)) {
                    if (ronda === 'final') {
                        if (gA > gB && idA) teamsRounds[idA] = 'campeon';
                        else if (gB > gA && idB) teamsRounds[idB] = 'campeon';
                    } else if (ronda === highestRound) {
                        if (gA > gB && idA) teamsRounds[idA] = `winner_${ronda}`;
                        else if (gB > gA && idB) teamsRounds[idB] = `winner_${ronda}`;
                    }
                }
            }
        }
    }

    // Obtener y clasificar a los equipos eliminados en fase de grupos
    let gruposRanking = [];
    if (tournamentState.structure?.grupos) {
        for (const gName in tournamentState.structure.grupos) {
            gruposRanking = gruposRanking.concat(tournamentState.structure.grupos[gName].equipos || []);
        }
        gruposRanking = gruposRanking.filter(t => t.id && !String(t.id).startsWith('ghost'));
        gruposRanking.sort((a, b) => sortTeamsForRanking(a, b, tournamentState));
    }

    const totalEliminados = gruposRanking.filter(t => teamsRounds[t.id] === 'grupos');
    const mitadEliminados = Math.ceil(totalEliminados.length / 2);

    // 3. Traducir rondas a puntos ELO
    let eloUpdates = {};
    for (const [id, maxRonda] of Object.entries(teamsRounds)) {
        let delta = 0;
        switch (maxRonda) {
            case 'campeon': delta = playoffVals.champion; break;
            case 'winner_semifinales':
            case 'final': delta = playoffVals.runner_up; break;
            case 'winner_cuartos':
            case 'semifinales': delta = playoffVals.semifinalist; break;
            case 'winner_octavos':
            case 'cuartos': delta = playoffVals.quarterfinalist; break;
            case 'octavos': delta = playoffVals.round_of_16; break;
            case 'dieciseisavos': 
            case 'grupos':
            default: {
                const objTeam = totalEliminados.find(t => t.id === id);
                if (objTeam) {
                    const idx = totalEliminados.indexOf(objTeam);
                    delta = (idx < mitadEliminados) ? playoffVals.groups_top_half : playoffVals.groups_bottom_half;
                } else {
                    delta = playoffVals.groups_bottom_half;
                }
                break;
            }
        }
        eloUpdates[id] = delta;
    }

    return { eloUpdates, teamMetaMap };
}

/**
 * Calcula puntos ELO según la posición final en Liga Pura o Formato Suizo.
 */
function calculateLeagueElo(tournamentState, leagueVals) {
    let eloUpdates = {};
    let teamMetaMap = {};

    let allTeams = [];
    if (tournamentState.structure?.grupos) {
        for (const gName in tournamentState.structure.grupos) {
            allTeams = allTeams.concat(tournamentState.structure.grupos[gName].equipos || []);
        }
    }

    allTeams = allTeams.filter(t => t.id && !String(t.id).startsWith('ghost'));
    if (allTeams.length === 0) return { eloUpdates, teamMetaMap };

    // Ordenar por puntos (desc), dif goles (desc), goles favor (desc) con desempate directo
    allTeams.sort((a, b) => sortTeamsForRanking(a, b, tournamentState));

    const total = allTeams.length;
    allTeams.forEach((team, index) => {
        const id = team.id || team.capitanId || team.managerId;
        teamMetaMap[id] = {
            nombre: team.nombre || team.name,
            eaClubId: team.eaClubId,
            managerId: team.managerId || team.capitanId || id
        };

        const rank = index + 1;
        let delta = 0;

        if (rank === 1) {
            delta = leagueVals.first;
        } else if (rank === 2) {
            delta = leagueVals.second;
        } else if (rank === 3) {
            delta = leagueVals.third;
        } else if (rank === total && total > 3) {
            delta = leagueVals.last;
        } else if (rank <= Math.ceil(total / 2)) {
            delta = leagueVals.top_half;
        } else {
            delta = leagueVals.bottom_half;
        }

        eloUpdates[id] = delta;
    });

    return { eloUpdates, teamMetaMap };
}
