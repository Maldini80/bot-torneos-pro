// src/utils/matchUtils.js

/**
 * Utility to extract and merge EA FC match statistics, correcting DNF results.
 */

function extractMatchInfo(match, primaryClubId) {
    const clubIds = Object.keys(match.clubs || {});
    const opponentId = clubIds.find(id => id !== String(primaryClubId));
    
    const ourStats = match.clubs[String(primaryClubId)] || {};
    const oppStats = opponentId ? (match.clubs[opponentId] || {}) : {};
    
    let ourGoals = parseInt(ourStats.goals || 0);
    let oppGoals = parseInt(oppStats.goals || 0);
    let maxSecs = 0;
    let isDnf = false;

    // Calculate max seconds played to help detect DNFs
    if (match.players && match.players[String(primaryClubId)]) {
        Object.values(match.players[String(primaryClubId)]).forEach(p => {
            const sec = parseInt(p.secondsPlayed || 0);
            if (sec > maxSecs) maxSecs = sec;
        });
    }
    if (match.players && opponentId && match.players[opponentId]) {
        Object.values(match.players[opponentId]).forEach(p => {
            const sec = parseInt(p.secondsPlayed || 0);
            if (sec > maxSecs) maxSecs = sec;
        });
    }

    // Detectar prórroga: si algún jugador jugó >= 5640 segundos (minuto 94+)
    let hasExtraTime = false;
    if (match.players) {
        for (const clubPlayers of Object.values(match.players)) {
            for (const p of Object.values(clubPlayers)) {
                if (parseInt(p.secondsPlayed || 0) >= 5640) {
                    hasExtraTime = true;
                    break;
                }
            }
            if (hasExtraTime) break;
        }
    }

    // Check for "ghost" goals (3-0 or 0-3 defaults by EA for DNF)
    if ((ourGoals === 3 && oppGoals === 0) || (ourGoals === 0 && oppGoals === 3)) {
        // En DNF, EA pone un 3-0 fantasma. La fuente de verdad son los goalsconceded cruzados:
        //   - Goles reales del rival = max(goalsconceded) de NUESTROS jugadores
        //   - Nuestros goles reales = max(goalsconceded) de jugadores del RIVAL
        // Esto captura goles en propia puerta y goles de jugadores que se fueron.
        
        // goalsconceded de NUESTROS jugadores → goles reales del rival
        let maxGoalsConceded = 0;
        if (match.players && match.players[String(primaryClubId)]) {
            Object.values(match.players[String(primaryClubId)]).forEach(p => {
                const conceded = parseInt(p.goalsconceded || 0);
                if (conceded > maxGoalsConceded) maxGoalsConceded = conceded;
            });
        }
        
        // goalsconceded de jugadores del RIVAL → nuestros goles reales
        let maxOppGoalsConceded = 0;
        if (match.players && opponentId && match.players[opponentId]) {
            Object.values(match.players[opponentId]).forEach(p => {
                const conceded = parseInt(p.goalsconceded || 0);
                if (conceded > maxOppGoalsConceded) maxOppGoalsConceded = conceded;
            });
        }
        
        // FUENTE PRIMARIA: goalsconceded cruzado
        let trueOurGoals = maxOppGoalsConceded;  // Lo que el rival encajó = nuestros goles
        let trueOppGoals = maxGoalsConceded;     // Lo que nosotros encajamos = goles del rival
        
        // FALLBACK: si ambos goalsconceded son 0, intentar con suma de goles individuales
        if (trueOurGoals === 0 && trueOppGoals === 0) {
            let realOur = 0, realOpp = 0;
            if (match.players && match.players[String(primaryClubId)]) {
                realOur = Object.values(match.players[String(primaryClubId)]).reduce((s, p) => s + parseInt(p.goals || 0), 0);
            }
            if (match.players && opponentId && match.players[opponentId]) {
                realOpp = Object.values(match.players[opponentId]).reduce((s, p) => s + parseInt(p.goals || 0), 0);
            }
            if (realOur > 0 || realOpp > 0) {
                trueOurGoals = realOur;
                trueOppGoals = realOpp;
            }
        }
        
        // Corregir si el resultado de EA no coincide con la fuente de verdad
        if (ourGoals !== trueOurGoals || oppGoals !== trueOppGoals) {
            ourGoals = trueOurGoals;
            oppGoals = trueOppGoals;
            isDnf = true;
        }
    }
    
    // Also consider it DNF if it ended prematurely (even if score wasn't exactly 3-0)
    if (maxSecs > 0 && maxSecs < 5200) {
        isDnf = true;
    }

    // Check if our team actually has player stats
    let ourHasRealStats = false;
    if (match.players && match.players[String(primaryClubId)]) {
        for (const p of Object.values(match.players[String(primaryClubId)])) {
            const pm = parseInt(p.passesMade || p.passesmade || p.passescompleted || 0);
            const sh = parseInt(p.shots || 0);
            const tk = parseInt(p.tacklesMade || p.tacklesmade || p.tacklescompleted || 0);
            if ((pm + sh + tk) > 0) { 
                ourHasRealStats = true; 
                break; 
            }
        }
    }

    const oppName = oppStats.details?.name || (opponentId ? `Club ID ${opponentId}` : 'Desconocido');
    return {
        ourGoals,
        oppGoals,
        maxSecs,
        isDnf,
        hasExtraTime,
        ourHasRealStats,
        opponentId,
        oppName,
        timestamp: parseInt(match.timestamp),
        match
    };
}

/**
 * Merges consecutive matches against the same opponent within a 3-hour window
 */
function mergeSessions(matches, primaryClubId) {
    if (!matches || matches.length === 0) return [];
    
    // Ensure matches are sorted by timestamp descending before merging
    const sortedMatches = [...matches].sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
    const groups = [];
    let i = 0;
    
    while (i < sortedMatches.length) {
        const info = extractMatchInfo(sortedMatches[i], primaryClubId);
        const currentGroup = [info];
        let j = i + 1;
        
        while (j < sortedMatches.length) {
            const nextInfo = extractMatchInfo(sortedMatches[j], primaryClubId);
            const timeDiff = Math.abs(info.timestamp - nextInfo.timestamp);
            
            // Merge condition: same opponent, within 3 hours (3 * 3600 seconds)
            if (nextInfo.opponentId === info.opponentId && timeDiff < 3 * 3600) {
                currentGroup.push(nextInfo);
                j++;
            } else {
                break;
            }
        }
        
        groups.push(currentGroup);
        i = j;
    }
    
    const mergedResults = groups.map(group => {
        const hasDnf = group.some(g => g.isDnf);
        
        if (hasDnf && group.length > 1) {
            let totalOur = 0, totalOpp = 0, totalSecs = 0;
            for (const g of group) {
                totalOur += g.ourGoals;
                totalOpp += g.oppGoals;
                totalSecs += g.maxSecs;
            }
            
            const earliestTimestamp = Math.min(...group.map(g => g.timestamp));
            // Get the match with the most data to act as the "base" for detailed stats
            const baseMatch = group.find(g => !g.isDnf)?.match || group[group.length - 1].match;
            
            return {
                isMerged: true,
                sessionCount: group.length,
                sessions: [...group].sort((a, b) => a.timestamp - b.timestamp),
                ourGoals: totalOur,
                oppGoals: totalOpp,
                maxSecs: totalSecs,
                isDnf: true, // The overall encounter had a DNF
                hasExtraTime: group.some(g => g.hasExtraTime),
                opponentId: group[0].opponentId,
                oppName: group[0].oppName,
                timestamp: earliestTimestamp,
                match: baseMatch // Best representation for player stats
            };
        } else {
            // No merge needed or only 1 session
            const g = group[0];
            return {
                isMerged: false,
                sessionCount: 1,
                sessions: [g],
                ourGoals: g.ourGoals,
                oppGoals: g.oppGoals,
                maxSecs: g.maxSecs,
                isDnf: g.isDnf,
                hasExtraTime: g.hasExtraTime,
                opponentId: g.opponentId,
                oppName: g.oppName,
                timestamp: g.timestamp,
                match: g.match
            };
        }
    });
    
    return mergedResults;
}

export {
    extractMatchInfo,
    mergeSessions
};
