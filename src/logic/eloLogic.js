// src/logic/eloLogic.js
// Módulo de cálculo y gestión de ELO masivo al finalizar torneos.

import { getBotSettings, getDb } from '../../database.js';

const ELO_MIN = 0;

// Emojis y orden de las ligas
export const LEAGUE_EMOJIS = {
    DIAMOND: '💎',
    GOLD: '👑',
    SILVER: '⚙️',
    BRONZE: '🥉'
};

export const LEAGUE_ORDER = ['DIAMOND', 'GOLD', 'SILVER', 'BRONZE'];

// Recompensas para Playoffs (Defaults)
const DEFAULT_PLAYOFF_VALS = {
    champion: 150,
    runner_up: 80,
    semifinalist: 40,
    quarterfinalist: 15,
    round_of_16: -20, // octavos
    groups_top_half: -30, // eliminados en grupos, mitad alta
    groups_bottom_half: -50 // eliminados en grupos, mitad baja
};

// Recompensas para Liga (Defaults)
const DEFAULT_LEAGUE_VALS = {
    first: 120,
    second: 75,
    third: 40,
    top_half: 15, // 4º hasta la mitad
    bottom_half: -35, // Desde la mitad hasta el penúltimo
    last: -60
};

/**
 * Recalcula masivamente la liga de un equipo según su ELO actual
 */
export function getLeagueByElo(elo) {
    if (elo >= 1550) return 'DIAMOND';
    if (elo >= 1300) return 'GOLD';
    if (elo >= 1000) return 'SILVER';
    return 'BRONZE';
}

/**
 * Función principal que se llama cuando un torneo finaliza
 */
export async function distributeTournamentElo(client, tournamentState) {
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

    let eloUpdates = {};
    let eloSummary = []; // Array para la tabla de Discord

    const settings = await getBotSettings();
    const configPlayoff = settings?.eloConfig?.playoff || DEFAULT_PLAYOFF_VALS;
    const configLeague = settings?.eloConfig?.league || DEFAULT_LEAGUE_VALS;

    const hasPlayoffs = !!(tournamentState.structure?.eliminatorias && Object.keys(tournamentState.structure.eliminatorias).length > 0 && tournamentState.structure.eliminatorias.final);

    if (hasPlayoffs) {
        eloUpdates = calculatePlayoffElo(tournamentState, configPlayoff);
    } else {
        eloUpdates = calculateLeagueElo(tournamentState, configLeague);
    }

    if (Object.keys(eloUpdates).length === 0) {
        console.log(`[ELO] Sin equipos válidos para actualizar en ${tournamentState.shortId}.`);
        return { success: false, message: 'Sin equipos válidos' };
    }

    // Aplicar los cambios a la DB de forma masiva
    let modified = 0;
    for (const [capitanId, eloDelta] of Object.entries(eloUpdates)) {
        if (!capitanId || capitanId === 'ghost') continue;

        const team = await testDb.collection('teams').findOne({ managerId: capitanId });
        if (!team) continue;

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
            name: team.name || team.nombre || `Team ${capitanId.substring(0,4)}`, 
            delta: eloDelta, 
            newElo: finalElo, 
            newLeague 
        });
        modified++;
    }

    // Marcar el torneo para no repetir el pago
    await testDb.collection('tournaments').updateOne(
        { _id: tournamentState._id },
        { $set: { eloDistributed: true } }
    );

    // Enviar notificación a Discord con la tabla de cambios
    if (modified > 0 && client) {
        try {
            const { EmbedBuilder } = await import('discord.js');
            const { CHANNELS } = await import('../../config.js');
            
            // Ordenar de mayor ganancia a mayor pérdida
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
                const namePad = t.name.padEnd(21).substring(0, 21);
                const deltaPad = deltaStr.padStart(7);
                tableString += `${namePad} | ${deltaPad} | ${t.newLeague}\n`;
            }
            tableString += '```';
            
            embed.setDescription(`Al finalizar este evento, el sistema ha repartido los puntos según el rendimiento de cada equipo:\n\n${tableString}`);

            const channel = await client.channels.fetch(CHANNELS.TOURNAMENTS_STATUS).catch(() => null);
            if (channel) {
                await channel.send({ embeds: [embed] });
            }
        } catch (e) {
            console.error('[ELO] Error al enviar notificación pública de ELO:', e.message);
        }
    }

    console.log(`[ELO] Se actualizó el ELO de ${modified} equipos para el torneo ${tournamentState.shortId}.`);
    return { success: true, teamsUpdated: modified };
}

/**
 * Calcula puntos ELO según la ronda máxima alcanzada.
 */
function calculatePlayoffElo(tournamentState, playoffVals) {
    let teamsRounds = {}; // { capitanId: 'final' | 'semifinales' | ... }
    
    // Rondas en orden de importancia (de menor a mayor)
    const rondas = ['dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'];

    // 1. Recolectar todos los equipos de la fase de grupos (si existe)
    if (tournamentState.structure?.grupos) {
        for (const gName in tournamentState.structure.grupos) {
            const equipos = tournamentState.structure.grupos[gName].equipos || [];
            for (const eq of equipos) {
                if (eq.id && eq.id !== 'ghost') {
                    teamsRounds[eq.id] = 'grupos'; // Nivel base
                }
            }
        }
    }

    // 2. Escanear las eliminatorias para ver hasta donde llegó cada uno
    const elims = tournamentState.structure.eliminatorias;
    for (const ronda of rondas) {
        if (!elims[ronda]) continue;
        const matches = Array.isArray(elims[ronda]) ? elims[ronda] : [elims[ronda]];
        for (const m of matches) {
            if (!m || !m.equipoA || !m.equipoB) continue;
            
            const idA = m.equipoA.id || m.equipoA._id;
            const idB = m.equipoB.id || m.equipoB._id;
            
            if (idA && idA !== 'ghost') teamsRounds[idA] = ronda;
            if (idB && idB !== 'ghost') teamsRounds[idB] = ronda;

            // Extraer campeón si es la final
            if (ronda === 'final' && m.resultado) {
                const [gA, gB] = m.resultado.split('-').map(Number);
                if (!isNaN(gA) && !isNaN(gB)) {
                    if (gA > gB) {
                        teamsRounds[idA] = 'campeon';
                    } else if (gB > gA) {
                        teamsRounds[idB] = 'campeon';
                    }
                }
            }
        }
    }

    // Obtener y clasificar a los equipos de grupos para ver quiénes están en el top half y bottom half de los eliminados
    let gruposRanking = [];
    if (tournamentState.structure?.grupos) {
        for (const gName in tournamentState.structure.grupos) {
            gruposRanking = gruposRanking.concat(tournamentState.structure.grupos[gName].equipos || []);
        }
        // Limpiar ghosts y ordenar de mejor a peor usando la misma lógica que la liga
        gruposRanking = gruposRanking.filter(t => t.id && t.id !== 'ghost');
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
            case 'final': delta = playoffVals.runner_up; break;
            case 'semifinales': delta = playoffVals.semifinalist; break;
            case 'cuartos': delta = playoffVals.quarterfinalist; break;
            case 'octavos': delta = playoffVals.round_of_16; break;
            case 'dieciseisavos': 
            case 'grupos':
            default:
                // Buscar si están en la mitad alta o baja de los eliminados
                const objTeam = totalEliminados.find(t => t.id === id);
                if (objTeam) {
                    const idx = totalEliminados.indexOf(objTeam);
                    delta = (idx < mitadEliminados) ? playoffVals.groups_top_half : playoffVals.groups_bottom_half;
                } else {
                    delta = playoffVals.groups_bottom_half; // Default
                }
                break;
        }
        eloUpdates[id] = delta;
    }
    
    return eloUpdates;
}

/**
 * Calcula puntos ELO según la posición final en Liga Pura.
 */
function calculateLeagueElo(tournamentState, leagueVals) {
    let eloUpdates = {};

    let allTeams = [];
    if (tournamentState.structure?.grupos) {
        for (const gName in tournamentState.structure.grupos) {
            allTeams = allTeams.concat(tournamentState.structure.grupos[gName].equipos || []);
        }
    }
    
    allTeams = allTeams.filter(t => t.id !== 'ghost');
    if (allTeams.length === 0) return eloUpdates;

    // Ordenar por puntos (desc), dif goles (desc), goles favor (desc)
    allTeams.sort((a, b) => sortTeamsForRanking(a, b, tournamentState));

    const total = allTeams.length;
    allTeams.forEach((team, index) => {
        const id = team.id;
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
            delta = leagueVals.top_half; // Mitad superior
        } else {
            delta = leagueVals.bottom_half; // Mitad inferior
        }

        eloUpdates[id] = delta;
    });

    return eloUpdates;
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
