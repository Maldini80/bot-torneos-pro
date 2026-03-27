// src/logic/eloLogic.js
// Módulo de cálculo y gestión de ELO masivo al finalizar torneos.

import { getDb } from '../../database.js';

const ELO_MIN = 0;

// Recompensas para Playoffs
const ELO_PLAYOFF_VALS = {
    champion: 150,
    runner_up: 80,
    semifinalist: 40,
    quarterfinalist: 15,
    round_of_16: -20, // octavos
    groups_or_earlier: -40 
};

// Recompensas para Liga (Sin eliminatorias)
const ELO_LEAGUE_VALS = {
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
function getLeagueByElo(elo) {
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

    const hasPlayoffs = !!(tournamentState.structure?.eliminatorias && Object.keys(tournamentState.structure.eliminatorias).length > 0 && tournamentState.structure.eliminatorias.final);

    if (hasPlayoffs) {
        eloUpdates = calculatePlayoffElo(tournamentState);
    } else {
        eloUpdates = calculateLeagueElo(tournamentState);
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
function calculatePlayoffElo(tournamentState) {
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

    // 3. Traducir rondas a puntos ELO
    let eloUpdates = {};
    for (const [id, maxRonda] of Object.entries(teamsRounds)) {
        let delta = 0;
        switch (maxRonda) {
            case 'campeon': delta = ELO_PLAYOFF_VALS.champion; break;
            case 'final': delta = ELO_PLAYOFF_VALS.runner_up; break;
            case 'semifinales': delta = ELO_PLAYOFF_VALS.semifinalist; break;
            case 'cuartos': delta = ELO_PLAYOFF_VALS.quarterfinalist; break;
            case 'octavos': delta = ELO_PLAYOFF_VALS.round_of_16; break;
            case 'dieciseisavos': 
            case 'grupos':
            default:
                delta = ELO_PLAYOFF_VALS.groups_or_earlier; break;
        }
        eloUpdates[id] = delta;
    }
    
    return eloUpdates;
}

/**
 * Calcula puntos ELO según la posición final en Liga Pura.
 */
function calculateLeagueElo(tournamentState) {
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
    allTeams.sort((a, b) => {
        if (b.stats.pts !== a.stats.pts) return b.stats.pts - a.stats.pts;
        if (b.stats.dg !== a.stats.dg) return b.stats.dg - a.stats.dg;
        return b.stats.gf - a.stats.gf;
    });

    const total = allTeams.length;
    allTeams.forEach((team, index) => {
        const id = team.id;
        const rank = index + 1;
        let delta = 0;

        if (rank === 1) {
            delta = ELO_LEAGUE_VALS.first;
        } else if (rank === 2) {
            delta = ELO_LEAGUE_VALS.second;
        } else if (rank === 3) {
            delta = ELO_LEAGUE_VALS.third;
        } else if (rank === total && total > 3) {
            delta = ELO_LEAGUE_VALS.last;
        } else if (rank <= Math.ceil(total / 2)) {
            delta = ELO_LEAGUE_VALS.top_half; // Mitad superior
        } else {
            delta = ELO_LEAGUE_VALS.bottom_half; // Mitad inferior
        }

        eloUpdates[id] = delta;
    });

    return eloUpdates;
}
