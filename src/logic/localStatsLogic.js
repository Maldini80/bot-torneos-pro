import { getDb } from '../../database.js';

export function parseDateFilter(raw) {
    if (!raw) return null;
    const parseDate = (s) => {
        const parts = s.trim().split('/');
        if (parts.length < 2) return null;
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parts[2] ? (parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])) : new Date().getFullYear();
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
    };
    
    const desdeMatch = raw.match(/^desde\s+(.+)$/i);
    if (desdeMatch) {
        const from = parseDate(desdeMatch[1]);
        return from ? { from, to: null } : null;
    }
    const hastaMatch = raw.match(/^hasta\s+(.+)$/i);
    if (hastaMatch) {
        const to = parseDate(hastaMatch[1]);
        if (to) to.setHours(23, 59, 59);
        return to ? { from: null, to } : null;
    }
    const rangeMatch = raw.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (rangeMatch) {
        const from = parseDate(rangeMatch[1]);
        const to = parseDate(rangeMatch[2]);
        if (to) to.setHours(23, 59, 59);
        return (from || to) ? { from, to } : null;
    }
    const single = parseDate(raw);
    if (single) {
        const to = new Date(single);
        to.setHours(23, 59, 59);
        return { from: single, to };
    }
    return null;
}

export function parseTimeFilter(raw) {
    if (!raw) return null;
    const parts = raw.split('-').map(s => s.trim());
    if (parts.length !== 2) return null;
    const fromTime = parts[0]; // e.g., "22:00"
    const toTime = parts[1];   // e.g., "00:00"
    return { from: fromTime, to: toTime };
}

function matchesTimeFilter(date, timeFilter) {
    if (!timeFilter) return true;
    const matchHour = date.getHours();
    const matchMinute = date.getMinutes();
    
    const parseHM = (s) => {
        const p = s.split(':');
        return { h: parseInt(p[0]), m: parseInt(p[1]) };
    };
    
    const from = parseHM(timeFilter.from);
    const to = parseHM(timeFilter.to);
    
    const matchVal = matchHour * 60 + matchMinute;
    const fromVal = from.h * 60 + from.m;
    let toVal = to.h * 60 + to.m;
    
    if (toVal < fromVal) {
        // Cruza la medianoche (ej: 23:00 - 01:00)
        return matchVal >= fromVal || matchVal <= toVal;
    } else {
        return matchVal >= fromVal && matchVal <= toVal;
    }
}

export async function aggregateTeamLocalStats(team, dateFilterStr = '', timeFilterStr = '') {
    const db = getDb();
    const tournaments = await db.collection('tournaments').find({}).toArray();

    const dateFilter = parseDateFilter(dateFilterStr);
    const timeFilter = parseTimeFilter(timeFilterStr);

    const playersData = {}; // username -> { goals, assists, etc, positions: { 'MCD': 5, 'DC': 2 } }

    const processMatch = (match) => {
        // Verificar si tiene estadísticas de EA (significa que se jugó bajo el bot y se procesó)
        if (!match || !match.eaStats) return;

        // Verificar filtros de fecha y hora
        if (dateFilter || timeFilter) {
            // Buscamos un timestamp en el match (normalmente lo seteamos cuando se reporta)
            // Si no tiene, miramos reportedScores
            let timestampMs = match.eaStats.timestamp ? match.eaStats.timestamp * 1000 : null;
            
            if (!timestampMs) {
                // Inferir del reporte
                if (match.reportedScores) {
                    const firstReport = Object.values(match.reportedScores)[0];
                    if (firstReport) timestampMs = firstReport.reportedAt;
                }
            }
            
            if (timestampMs) {
                const d = new Date(timestampMs);

                if (dateFilter) {
                    if (dateFilter.from && d < dateFilter.from) return;
                    if (dateFilter.to && d > dateFilter.to) return;
                }

                if (timeFilter) {
                    if (!matchesTimeFilter(d, timeFilter)) return;
                }
            }
        }

        // Determinar si somos clubA o clubB
        // match.equipoA.id suele ser el managerId (Discord ID del capitán)
        let myPlayers = null;
        const isTeamA = match.equipoA.id === team.managerId || (team.captains && team.captains.includes(match.equipoA.id));
        const isTeamB = match.equipoB.id === team.managerId || (team.captains && team.captains.includes(match.equipoB.id));
        
        if (isTeamA) {
            myPlayers = match.eaStats.clubA?.players;
        } else if (isTeamB) {
            myPlayers = match.eaStats.clubB?.players;
        }

        if (!myPlayers) return;

        for (const [pName, stats] of Object.entries(myPlayers)) {
            if (!playersData[pName]) {
                playersData[pName] = {
                    name: stats.name || pName,
                    gamesPlayed: 0,
                    goals: 0,
                    assists: 0,
                    passesMade: 0,
                    tacklesMade: 0,
                    cleanSheetsDef: 0,
                    cleanSheetsGK: 0,
                    manOfTheMatch: 0,
                    positions: {}
                };
            }
            
            const pd = playersData[pName];
            pd.gamesPlayed += 1;
            pd.goals += parseInt(stats.goals || 0);
            pd.assists += parseInt(stats.assists || 0);
            pd.passesMade += parseInt(stats.passesMade || 0);
            pd.tacklesMade += parseInt(stats.tacklesMade || 0);
            pd.manOfTheMatch += parseInt(stats.mom || 0);
            
            const pos = stats.pos ? stats.pos.toUpperCase() : 'JUG';
            
            if (pos === 'POR') {
                pd.cleanSheetsGK += parseInt(stats.cleanSheets || 0);
            } else if (['DFC', 'LI', 'LD', 'CAD', 'CAI', 'DFI', 'DFD'].includes(pos)) {
                pd.cleanSheetsDef += parseInt(stats.cleanSheets || 0);
            }

            // Contador de posiciones
            if (!pd.positions[pos]) pd.positions[pos] = 0;
            pd.positions[pos]++;
        }
    };

    for (const tournament of tournaments) {
        if (tournament.structure.calendario) {
            for (const groupMatches of Object.values(tournament.structure.calendario)) {
                for (const match of groupMatches) {
                    processMatch(match);
                }
            }
        }
        if (tournament.structure.eliminatorias) {
            for (const stageKey of Object.keys(tournament.structure.eliminatorias)) {
                if (stageKey === 'rondaActual') continue;
                const stageData = tournament.structure.eliminatorias[stageKey];
                if (Array.isArray(stageData)) {
                    for (const match of stageData) {
                        processMatch(match);
                    }
                } else if (stageData && typeof stageData === 'object' && stageData.matchId) {
                    processMatch(stageData);
                }
            }
        }
    }

    // Convertir a array y resolver la posición más jugada (posName)
    const roster = Object.values(playersData).map(p => {
        let maxPos = 'JUG';
        let maxCount = -1;
        for (const [pos, count] of Object.entries(p.positions)) {
            if (count > maxCount) {
                maxCount = count;
                maxPos = pos;
            }
        }
        
        return {
            ...p,
            posName: maxPos,
            favoritePosition: maxPos // fallback
        };
    });

    return roster;
}
