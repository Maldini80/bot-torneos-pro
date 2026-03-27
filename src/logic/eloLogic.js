// src/logic/eloLogic.js
// Módulo independiente de cálculo y gestión de ELO para torneos gratuitos.
// Todas las operaciones son atómicas ($inc) y desacopladas del flujo principal.

import { getDb } from '../../database.js';

// --- CONSTANTES DE ELO ---
const BASE_ELO = 1000;
const ELO_MIN = 0;
const DIFF_THRESHOLD = 100; // Diferencia para considerar favorito/underdog

// Tabla de puntos ELO
const ELO_TABLE = {
    balanced: { win: 25, lose: -25, draw: 2 },
    favorite_wins: { win: 15, lose: -15, draw: 2 },
    underdog_wins: { win: 35, lose: -35, draw: 2 }
};

// Bonificaciones por torneo
const TOURNAMENT_BONUS = {
    champion: 50,
    runner_up: 25
};

/**
 * Calcula el delta de ELO basado en la diferencia entre los dos equipos y el resultado.
 * @param {number} eloA - ELO del equipo A
 * @param {number} eloB - ELO del equipo B
 * @param {number} golesA - Goles del equipo A
 * @param {number} golesB - Goles del equipo B
 * @returns {{ deltaA: number, deltaB: number, scenario: string }}
 */
function calculateEloDelta(eloA, eloB, golesA, golesB) {
    const diff = Math.abs(eloA - eloB);
    const isDraw = golesA === golesB;

    if (isDraw) {
        return { deltaA: ELO_TABLE.balanced.draw, deltaB: ELO_TABLE.balanced.draw, scenario: 'draw' };
    }

    const aWins = golesA > golesB;

    if (diff < DIFF_THRESHOLD) {
        // Partido equilibrado
        return {
            deltaA: aWins ? ELO_TABLE.balanced.win : ELO_TABLE.balanced.lose,
            deltaB: aWins ? ELO_TABLE.balanced.lose : ELO_TABLE.balanced.win,
            scenario: 'balanced'
        };
    }

    // Hay favorito (el que tiene más ELO)
    const aIsFavorite = eloA > eloB;

    if (aWins) {
        // ¿Ganó el favorito o el underdog?
        if (aIsFavorite) {
            // Favorito gana → menos puntos
            return {
                deltaA: ELO_TABLE.favorite_wins.win,
                deltaB: ELO_TABLE.favorite_wins.lose,
                scenario: 'favorite_wins'
            };
        } else {
            // Underdog gana → más puntos
            return {
                deltaA: ELO_TABLE.underdog_wins.win,
                deltaB: ELO_TABLE.underdog_wins.lose,
                scenario: 'underdog_wins'
            };
        }
    } else {
        // B gana
        if (!aIsFavorite) {
            // B es favorito y gana
            return {
                deltaA: ELO_TABLE.favorite_wins.lose,
                deltaB: ELO_TABLE.favorite_wins.win,
                scenario: 'favorite_wins'
            };
        } else {
            // B es underdog y gana
            return {
                deltaA: ELO_TABLE.underdog_wins.lose,
                deltaB: ELO_TABLE.underdog_wins.win,
                scenario: 'underdog_wins'
            };
        }
    }
}

/**
 * Busca un equipo en test.teams por su managerId (capitanId del torneo).
 * @param {string} capitanId - El ID del capitán/manager
 * @returns {Promise<object|null>} El documento del equipo o null
 */
async function findTeamByCapitanId(capitanId) {
    const testDb = getDb('test');
    return testDb.collection('teams').findOne({ managerId: capitanId });
}

/**
 * Actualiza el ELO y las rachas de un equipo tras un partido de torneo.
 * Solo aplica a torneos GRATUITOS (no de pago, no drafts, no amistosos).
 *
 * @param {string} teamAId - capitanId del equipo A
 * @param {string} teamBId - capitanId del equipo B
 * @param {number} golesA - Goles del equipo A
 * @param {number} golesB - Goles del equipo B
 * @param {string} matchId - ID único del partido
 * @param {string} tournamentShortId - shortId del torneo
 */
export async function updateEloAfterMatch(teamAId, teamBId, golesA, golesB, matchId, tournamentShortId) {
    const testDb = getDb('test');
    const teamsCol = testDb.collection('teams');

    // Buscar ambos equipos
    const teamA = await findTeamByCapitanId(teamAId);
    const teamB = await findTeamByCapitanId(teamBId);

    if (!teamA || !teamB) {
        console.warn(`[ELO] No se encontraron ambos equipos para el partido ${matchId}. A=${teamAId}(${!!teamA}), B=${teamBId}(${!!teamB})`);
        return;
    }

    const eloA = teamA.elo ?? BASE_ELO;
    const eloB = teamB.elo ?? BASE_ELO;
    const { deltaA, deltaB, scenario } = calculateEloDelta(eloA, eloB, golesA, golesB);

    const isDraw = golesA === golesB;
    const aWins = golesA > golesB;
    const now = new Date();

    // --- Registro de historial para trazabilidad y reversión ---
    const historyEntryA = {
        date: now,
        oldElo: eloA,
        newElo: Math.max(ELO_MIN, eloA + deltaA),
        delta: deltaA,
        reason: `match`,
        matchId,
        tournamentShortId,
        scenario,
        resultado: `${golesA}-${golesB}`,
        rivalTeamId: teamB._id.toString()
    };

    const historyEntryB = {
        date: now,
        oldElo: eloB,
        newElo: Math.max(ELO_MIN, eloB + deltaB),
        delta: deltaB,
        reason: `match`,
        matchId,
        tournamentShortId,
        scenario,
        resultado: `${golesB}-${golesA}`,
        rivalTeamId: teamA._id.toString()
    };

    // --- Actualización atómica del equipo A ---
    const updateA = {
        $inc: {
            elo: deltaA,
            'historicalStats.totalMatchesPlayed': 1
        },
        $push: { eloHistory: { $each: [historyEntryA], $slice: -100 } } // Limitar historial a 100 entradas
    };

    if (isDraw) {
        updateA.$inc['historicalStats.totalDraws'] = 1;
        updateA.$set = {
            'historicalStats.currentWinStreak': 0,
            'historicalStats.currentLossStreak': 0
        };
    } else if (aWins) {
        updateA.$inc['historicalStats.totalWins'] = 1;
        updateA.$inc['historicalStats.currentWinStreak'] = 1;
        updateA.$set = { 'historicalStats.currentLossStreak': 0 };
    } else {
        updateA.$inc['historicalStats.totalLosses'] = 1;
        updateA.$inc['historicalStats.currentLossStreak'] = 1;
        updateA.$set = { 'historicalStats.currentWinStreak': 0 };
    }

    // Aplicar y luego actualizar récords de rachas (requiere leer el valor actual)
    await teamsCol.updateOne({ _id: teamA._id }, updateA);

    // Proteger ELO mínimo
    await teamsCol.updateOne({ _id: teamA._id, elo: { $lt: ELO_MIN } }, { $set: { elo: ELO_MIN } });

    // Actualizar récords de rachas del equipo A
    const updatedTeamA = await teamsCol.findOne({ _id: teamA._id });
    if (updatedTeamA) {
        const streakUpdates = {};
        if ((updatedTeamA.historicalStats?.currentWinStreak || 0) > (updatedTeamA.historicalStats?.bestWinStreak || 0)) {
            streakUpdates['historicalStats.bestWinStreak'] = updatedTeamA.historicalStats.currentWinStreak;
        }
        if ((updatedTeamA.historicalStats?.currentLossStreak || 0) > (updatedTeamA.historicalStats?.worstLossStreak || 0)) {
            streakUpdates['historicalStats.worstLossStreak'] = updatedTeamA.historicalStats.currentLossStreak;
        }
        if (Object.keys(streakUpdates).length > 0) {
            await teamsCol.updateOne({ _id: teamA._id }, { $set: streakUpdates });
        }
    }

    // --- Actualización atómica del equipo B ---
    const updateB = {
        $inc: {
            elo: deltaB,
            'historicalStats.totalMatchesPlayed': 1
        },
        $push: { eloHistory: { $each: [historyEntryB], $slice: -100 } }
    };

    if (isDraw) {
        updateB.$inc['historicalStats.totalDraws'] = 1;
        updateB.$set = {
            'historicalStats.currentWinStreak': 0,
            'historicalStats.currentLossStreak': 0
        };
    } else if (!aWins) {
        // B gana
        updateB.$inc['historicalStats.totalWins'] = 1;
        updateB.$inc['historicalStats.currentWinStreak'] = 1;
        updateB.$set = { 'historicalStats.currentLossStreak': 0 };
    } else {
        // B pierde
        updateB.$inc['historicalStats.totalLosses'] = 1;
        updateB.$inc['historicalStats.currentLossStreak'] = 1;
        updateB.$set = { 'historicalStats.currentWinStreak': 0 };
    }

    await teamsCol.updateOne({ _id: teamB._id }, updateB);
    await teamsCol.updateOne({ _id: teamB._id, elo: { $lt: ELO_MIN } }, { $set: { elo: ELO_MIN } });

    // Actualizar récords de rachas del equipo B
    const updatedTeamB = await teamsCol.findOne({ _id: teamB._id });
    if (updatedTeamB) {
        const streakUpdates = {};
        if ((updatedTeamB.historicalStats?.currentWinStreak || 0) > (updatedTeamB.historicalStats?.bestWinStreak || 0)) {
            streakUpdates['historicalStats.bestWinStreak'] = updatedTeamB.historicalStats.currentWinStreak;
        }
        if ((updatedTeamB.historicalStats?.currentLossStreak || 0) > (updatedTeamB.historicalStats?.worstLossStreak || 0)) {
            streakUpdates['historicalStats.worstLossStreak'] = updatedTeamB.historicalStats.currentLossStreak;
        }
        if (Object.keys(streakUpdates).length > 0) {
            await teamsCol.updateOne({ _id: teamB._id }, { $set: streakUpdates });
        }
    }

    console.log(`[ELO] Partido ${matchId} (${tournamentShortId}): ${teamA.name} ${eloA}→${Math.max(ELO_MIN, eloA + deltaA)} (${deltaA > 0 ? '+' : ''}${deltaA}) | ${teamB.name} ${eloB}→${Math.max(ELO_MIN, eloB + deltaB)} (${deltaB > 0 ? '+' : ''}${deltaB}) [${scenario}]`);
}

/**
 * Revierte los cambios de ELO y rachas de un partido específico.
 * Busca en eloHistory el registro con el matchId y deshace el cambio.
 *
 * @param {string} matchId - ID del partido a revertir
 */
export async function revertEloAfterMatch(matchId) {
    const testDb = getDb('test');
    const teamsCol = testDb.collection('teams');

    // Buscar todos los equipos que tengan un registro con este matchId en su historial
    const affectedTeams = await teamsCol.find({
        'eloHistory.matchId': matchId
    }).toArray();

    if (affectedTeams.length === 0) {
        console.warn(`[ELO REVERT] No se encontraron registros para el partido ${matchId}`);
        return;
    }

    for (const team of affectedTeams) {
        const historyEntry = team.eloHistory.find(h => h.matchId === matchId);
        if (!historyEntry) continue;

        const revertDelta = -historyEntry.delta;

        // Determinar qué stat revertir basándose en el resultado original
        const [golesEquipo, golesRival] = historyEntry.resultado.split('-').map(Number);
        const wasWin = golesEquipo > golesRival;
        const wasDraw = golesEquipo === golesRival;
        const wasLoss = golesEquipo < golesRival;

        const revertUpdate = {
            $inc: {
                elo: revertDelta,
                'historicalStats.totalMatchesPlayed': -1
            },
            $pull: { eloHistory: { matchId: matchId } }
        };

        if (wasWin) revertUpdate.$inc['historicalStats.totalWins'] = -1;
        else if (wasDraw) revertUpdate.$inc['historicalStats.totalDraws'] = -1;
        else if (wasLoss) revertUpdate.$inc['historicalStats.totalLosses'] = -1;

        await teamsCol.updateOne({ _id: team._id }, revertUpdate);

        // Proteger ELO mínimo
        await teamsCol.updateOne({ _id: team._id, elo: { $lt: ELO_MIN } }, { $set: { elo: ELO_MIN } });

        // Recalcular rachas tras reversión (no se puede hacer incrementalmente, hay que recalcular)
        await recalculateStreaks(teamsCol, team._id);

        console.log(`[ELO REVERT] ${team.name}: ELO revertido ${historyEntry.delta > 0 ? '+' : ''}${historyEntry.delta} → ${revertDelta > 0 ? '+' : ''}${revertDelta} para partido ${matchId}`);
    }
}

/**
 * Recalcula las rachas de un equipo basándose en su eloHistory actual.
 * Se usa tras una reversión cuando no podemos determinar la racha incrementalmente.
 */
async function recalculateStreaks(teamsCol, teamId) {
    const team = await teamsCol.findOne({ _id: teamId });
    if (!team || !team.eloHistory || team.eloHistory.length === 0) {
        await teamsCol.updateOne({ _id: teamId }, {
            $set: {
                'historicalStats.currentWinStreak': 0,
                'historicalStats.currentLossStreak': 0,
                'historicalStats.bestWinStreak': 0,
                'historicalStats.worstLossStreak': 0
            }
        });
        return;
    }

    // Recorrer todo el historial de partidos cronológicamente para recalcular
    const matchHistory = team.eloHistory
        .filter(h => h.reason === 'match')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    let currentWinStreak = 0;
    let bestWinStreak = 0;
    let currentLossStreak = 0;
    let worstLossStreak = 0;

    for (const entry of matchHistory) {
        const [gf, ga] = entry.resultado.split('-').map(Number);
        if (gf > ga) {
            // Victoria
            currentWinStreak++;
            currentLossStreak = 0;
            bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
        } else if (gf < ga) {
            // Derrota
            currentLossStreak++;
            currentWinStreak = 0;
            worstLossStreak = Math.max(worstLossStreak, currentLossStreak);
        } else {
            // Empate
            currentWinStreak = 0;
            currentLossStreak = 0;
        }
    }

    await teamsCol.updateOne({ _id: teamId }, {
        $set: {
            'historicalStats.currentWinStreak': currentWinStreak,
            'historicalStats.bestWinStreak': bestWinStreak,
            'historicalStats.currentLossStreak': currentLossStreak,
            'historicalStats.worstLossStreak': worstLossStreak
        }
    });
}

/**
 * Aplica bonificación de ELO por resultado final de torneo.
 * Solo para torneos gratuitos.
 *
 * @param {string} capitanId - El managerId/capitanId del equipo
 * @param {'champion'|'runner_up'} bonusType - Tipo de bonificación
 * @param {string} tournamentShortId - shortId del torneo
 */
export async function applyTournamentBonus(capitanId, bonusType, tournamentShortId) {
    const testDb = getDb('test');
    const teamsCol = testDb.collection('teams');

    const team = await findTeamByCapitanId(capitanId);
    if (!team) {
        console.warn(`[ELO BONUS] No se encontró equipo para capitanId=${capitanId}`);
        return;
    }

    const bonus = TOURNAMENT_BONUS[bonusType] || 0;
    const currentElo = team.elo ?? BASE_ELO;

    const historyEntry = {
        date: new Date(),
        oldElo: currentElo,
        newElo: currentElo + bonus,
        delta: bonus,
        reason: `tournament_${bonusType}`,
        tournamentShortId
    };

    const statsInc = {
        'historicalStats.tournamentsPlayed': 1
    };

    if (bonusType === 'champion') {
        statsInc['historicalStats.tournamentsWon'] = 1;
    } else if (bonusType === 'runner_up') {
        statsInc['historicalStats.tournamentsRunnerUp'] = 1;
    }

    await teamsCol.updateOne({ _id: team._id }, {
        $inc: { elo: bonus, ...statsInc },
        $push: { eloHistory: { $each: [historyEntry], $slice: -100 } }
    });

    console.log(`[ELO BONUS] ${team.name}: +${bonus} ELO por ${bonusType} en torneo ${tournamentShortId} (${currentElo}→${currentElo + bonus})`);
}
