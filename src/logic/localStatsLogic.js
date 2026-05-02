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

const POS_MAP = {
    0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
    6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
    11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC',
    'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
    'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
    'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
    'attackingmidfield': 'MCO', 'leftmid': 'MI', 'rightmid': 'MD', 'forward': 'DC', 'attacker': 'DC',
    'striker': 'DC', 'winger': 'ED', 'wing': 'ED'
};

function resolvePos(posRaw, archetypeid) {
    if (!isNaN(posRaw) && POS_MAP[posRaw] !== undefined) return POS_MAP[posRaw];
    const p = String(posRaw || '').toLowerCase();
    if (p === 'goalkeeper') return 'POR';
    if (p === 'forward' || p === 'attacker' || p === 'striker') return 'DC';
    if (p === 'defender' || p === 'centerback') return 'DFC';
    if (p === 'midfielder') {
        if (archetypeid == 10 || archetypeid == 12) return 'CARR';
        return 'MC';
    }
    return POS_MAP[posRaw] || posRaw || '???';
}

export function parseDaysFilter(raw) {
    if (!raw) return null;
    const map = { 'L': 1, 'M': 2, 'X': 3, 'J': 4, 'V': 5, 'S': 6, 'D': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '0': 0 };
    const days = raw.toUpperCase().replace(/-/g, ',').split(',').map(s => {
        const d = s.trim();
        return map[d] !== undefined ? map[d] : null;
    }).filter(d => d !== null);
    return days.length > 0 ? days : null;
}

export async function aggregateTeamLocalStats(team, dateFilterStr = '', timeFilterStr = '', daysFilterStr = '') {
    const db = getDb();
    const matchColl = db.collection('scanned_matches');

    const dateFilter = parseDateFilter(dateFilterStr);
    const timeFilter = parseTimeFilter(timeFilterStr);
    const daysFilter = parseDaysFilter(daysFilterStr);

    if (!team.eaClubId) {
        throw new Error('El equipo no tiene un ID de club de EA vinculado.');
    }

    // Buscamos TODOS los partidos donde aparece el ID del club (en clubs.*)
    const query = {};
    query[`clubs.${team.eaClubId}`] = { $exists: true };

    const matches = await matchColl.find(query).toArray();
    const playersData = {}; // username -> stats

    for (const match of matches) {
        if (!match || !match.timestamp) continue;

        // timestamp de EA viene en segundos
        const timestampMs = parseInt(match.timestamp) * 1000;
        const dUtc = new Date(timestampMs);

        // Convertir a hora de Madrid para comparaciones fiables
        const madridTimeStr = dUtc.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
        const [h, min] = madridTimeStr.split(':').map(Number);
        
        const madridDateStr = dUtc.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); // "2026-04-25"
        const [year, month, day] = madridDateStr.split('-').map(Number);
        
        // Creamos un Date usando el timezone local del servidor PERO con los valores exactos de Madrid
        // Así parseDateFilter (que usa el timezone local) y matchesTimeFilter coinciden perfectamente.
        const d = new Date(year, month - 1, day, h, min, 0);

        // Lógica "Gamer": Si un partido se juega a las 01:00 AM del día 26, 
        // para el jugador pertenece a la "sesión de noche" del día 25.
        // Restamos 1 día a la fecha lógica de comparación si es de madrugada (antes de las 06:00).
        const logicalDate = new Date(d);
        if (h < 6) {
            logicalDate.setDate(logicalDate.getDate() - 1);
        }

        if (dateFilter) {
            if (dateFilter.from && logicalDate < dateFilter.from) continue;
            if (dateFilter.to && logicalDate > dateFilter.to) continue;
        }

        if (daysFilter) {
            if (!daysFilter.includes(logicalDate.getDay())) continue;
        }

        if (timeFilter) {
            if (!matchesTimeFilter(d, timeFilter)) continue;
        }

        const myPlayers = match.players && match.players[String(team.eaClubId)];
        if (!myPlayers) continue;

        const clubs = match.clubs || {};
        const oppId = Object.keys(clubs).find(id => id !== String(team.eaClubId));
        let goalsAgainstThisMatch = 0;
        if (oppId && clubs[oppId]) {
            goalsAgainstThisMatch = parseInt(clubs[oppId].goals || 0);
        }

        // --- Check de DNF (partido muy corto sin stats) ---
        let matchMaxSecs = 0;
        for (const p of Object.values(myPlayers)) {
            const sec = parseInt(p.secondsPlayed || 0);
            if (sec > matchMaxSecs) matchMaxSecs = sec;
        }
        const isShortMatch = matchMaxSecs > 0 && matchMaxSecs < 5200;

        for (const [pid, player] of Object.entries(myPlayers)) {
            const pName = player.playername;
            if (!pName) continue;

            const pm = parseInt(player.passesMade || player.passesmade || player.passescompleted || 0);
            const sh = parseInt(player.shots || 0);
            const tk = parseInt(player.tacklesMade || player.tacklesmade || player.tacklescompleted || 0);
            const hasRealStats = (pm + sh + tk) > 0;

            if (isShortMatch && !hasRealStats) {
                // Partido abandonado sin jugar casi, ignorar para stats
                continue;
            }

            if (!playersData[pName]) {
                playersData[pName] = {
                    name: pName,
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
            pd.goals += parseInt(player.goals || 0);
            pd.assists += parseInt(player.assists || 0);
            pd.passesMade += pm;
            pd.tacklesMade += tk;
            pd.manOfTheMatch += parseInt(player.mom || 0);
            
            const mappedPos = resolvePos(player.pos, player.archetypeid);
            
            if (mappedPos === 'POR') {
                pd.cleanSheetsGK += (goalsAgainstThisMatch === 0) ? 1 : 0;
            } else if (['DFC', 'LI', 'LD', 'CAD', 'CAI', 'DFI', 'DFD', 'CARR'].includes(mappedPos)) {
                pd.cleanSheetsDef += (goalsAgainstThisMatch === 0) ? 1 : 0;
            }

            if (!pd.positions[mappedPos]) pd.positions[mappedPos] = 0;
            pd.positions[mappedPos]++;
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
