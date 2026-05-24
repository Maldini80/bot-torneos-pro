import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

// Replicate visualizerServer.js helper functions
function getMadridDateDetails(timestampSec) {
    try {
        const adjustedTimestampSec = parseInt(timestampSec) - 14400;
        const dateObj = new Date(adjustedTimestampSec * 1000);
        const actualDateObj = new Date(parseInt(timestampSec) * 1000);

        const dateStr = dateObj.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

        const timeStr = actualDateObj.toLocaleTimeString('en-US', {
            timeZone: 'Europe/Madrid',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        const [hourStr, minuteStr] = timeStr.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        const timeMinutes = hour * 60 + minute;

        const weekdayStr = dateObj.toLocaleDateString('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' });
        const weekdays = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
        const dayOfWeek = weekdays[weekdayStr] !== undefined ? weekdays[weekdayStr] : dateObj.getDay();

        return { dateStr, hour, minute, timeMinutes, dayOfWeek };
    } catch (e) {
        console.error('Error in getMadridDateDetails:', e);
        return { dateStr: 'NaN-NaN-NaN', hour: NaN, minute: NaN, timeMinutes: NaN, dayOfWeek: NaN };
    }
}

function rebuildFindBestSession(group, clubId) {
    if (group.length === 1) return group[0];
    let best = group[0], bestScore = 0;
    for (const match of group) {
        let maxSecs = 0, hasRealStats = false;
        if (match.players && match.players[String(clubId)]) {
            for (const p of Object.values(match.players[String(clubId)])) {
                const sec = parseInt(p.secondsPlayed || 0);
                if (sec > maxSecs) maxSecs = sec;
                const pm = parseInt(p.passesMade || p.passesmade || 0);
                const sh = parseInt(p.shots || 0);
                const tk = parseInt(p.tacklesMade || p.tacklesmade || 0);
                if ((pm + sh + tk) > 0) hasRealStats = true;
            }
        }
        const score = (hasRealStats ? 10000 : 0) + maxSecs;
        if (score > bestScore) { bestScore = score; best = match; }
    }
    return best;
}

function rebuildGroupMatchesByOpponent(matches, clubId) {
    const sorted = [...matches].sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
    const groups = [];
    const used = new Set();
    for (let i = 0; i < sorted.length; i++) {
        if (used.has(i)) continue;
        const match = sorted[i];
        const opponentId = Object.keys(match.clubs || {}).find(id => id !== String(clubId));
        const group = [match];
        used.add(i);
        for (let j = i + 1; j < sorted.length; j++) {
            if (used.has(j)) continue;
            const nextMatch = sorted[j];
            const nextOpponentId = Object.keys(nextMatch.clubs || {}).find(id => id !== String(clubId));
            const timeDiff = Math.abs(parseInt(match.timestamp) - parseInt(nextMatch.timestamp));
            if (nextOpponentId === opponentId && timeDiff < 3 * 3600) { group.push(nextMatch); used.add(j); }
        }
        groups.push(group);
    }
    return groups;
}

async function debugRebuild() {
    await connectDb();
    const db = getDb();
    
    // Find first team that has scanned matches
    const allTeams = await getDb('test').collection('teams').find({ eaClubId: { $ne: null } }).toArray();
    let team = null;
    let matches = [];
    for (const t of allTeams) {
        const m = await db.collection('scanned_matches').find({ [`clubs.${t.eaClubId}`]: { $exists: true } }).toArray();
        if (m.length > 0) {
            team = t;
            matches = m;
            break;
        }
    }
    
    if (!team) {
        console.error('No teams with scanned matches found in database!');
        process.exit(1);
    }
    const clubId = team.eaClubId;
    console.log(`Debugging rebuild for team: ${team.name} (eaClubId: ${clubId})`);
    console.log(`Found ${matches.length} matches in database for this team.`);

    if (matches.length === 0) {
        process.exit(0);
    }

    // Mock rebuild filters (useFilters: true, specificDates, startTime: "23:00", endTime: "00:15")
    const filters = {
        useFilters: true,
        specificDates: new Set([
            '2025-11-05', '2025-11-10', '2025-12-03', '2025-12-04',
            '2025-12-17', '2025-12-22', '2026-01-07', '2026-01-08',
            '2026-02-09', '2026-03-01', '2026-03-02', '2026-03-03',
            '2026-03-06', '2026-03-07', '2026-03-09', '2026-04-27'
        ]),
        startTime: '23:00',
        endTime: '00:15'
    };
    
    console.log('Using filters:', {
        useFilters: filters.useFilters,
        startTime: filters.startTime,
        endTime: filters.endTime,
        specificDatesCount: filters.specificDates.size
    });

    const groups = rebuildGroupMatchesByOpponent(matches, clubId);
    console.log(`Grouped matches into ${groups.length} sessions/groups.`);

    let matchedSessions = 0;
    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const bestMatch = rebuildFindBestSession(group, clubId);
        if (!bestMatch || !bestMatch.timestamp) {
            console.log(`Group ${g}: skipped because no bestMatch or no timestamp`);
            continue;
        }

        const details = getMadridDateDetails(bestMatch.timestamp);
        
        // Log details of first 10 sessions or matched sessions
        let skipReason = null;
        if (filters.specificDates && filters.specificDates.size > 0) {
            if (!filters.specificDates.has(details.dateStr)) {
                skipReason = `date ${details.dateStr} not in specificDates`;
            }
        }

        if (!skipReason) {
            let matchesTime = true;
            const startMin = filters.startTime ? filters.startTime.split(':').map(Number).reduce((h, m) => h * 60 + m) : null;
            const endMin = filters.endTime ? filters.endTime.split(':').map(Number).reduce((h, m) => h * 60 + m) : null;

            if (startMin !== null && endMin !== null) {
                if (startMin <= endMin) {
                    if (details.timeMinutes < startMin || details.timeMinutes > endMin) {
                        matchesTime = false;
                    }
                } else {
                    if (details.timeMinutes < startMin && details.timeMinutes > endMin) {
                        matchesTime = false;
                    }
                }
            } else if (startMin !== null) {
                if (details.timeMinutes < startMin) matchesTime = false;
            } else if (endMin !== null) {
                if (details.timeMinutes > endMin) matchesTime = false;
            }

            if (!matchesTime) {
                skipReason = `timeMinutes ${details.timeMinutes} (${details.hour}:${String(details.minute).padStart(2, '0')}) outside range [${filters.startTime} - ${filters.endTime}]`;
            }
        }

        if (!skipReason) {
            matchedSessions++;
            console.log(`✅ Session ${g} matched! Date: ${details.dateStr}, Time: ${details.hour}:${String(details.minute).padStart(2, '0')} (timeMinutes: ${details.timeMinutes}), Timestamp: ${bestMatch.timestamp}`);
        } else {
            if (g < 10) {
                console.log(`❌ Session ${g} skipped: ${skipReason}. Date: ${details.dateStr}, Time: ${details.hour}:${String(details.minute).padStart(2, '0')} (timeMinutes: ${details.timeMinutes}), Timestamp: ${bestMatch.timestamp}`);
            }
        }
    }

    console.log(`\nRebuild debugging completed. Total matched sessions: ${matchedSessions} / ${groups.length}`);
    process.exit(0);
}

debugRebuild().catch(console.error);
