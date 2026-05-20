import { connectDb, getDb } from '../database.js';

const POS_MAP = {
    0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
    6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
    11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC',
    'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
    'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
    'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
    'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC',
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

function extractBuild(matchData) {
    const attrString = matchData.vproattr || "";
    const attrParts = attrString.split('|');
    let height = null, weight = null;
    if (attrParts.length >= 2) {
        const last3 = attrParts.slice(-3);
        for (const val of last3) {
            const num = parseInt(val);
            if (!isNaN(num)) {
                if (num >= 150 && num <= 220 && !height) height = num;
                else if (num >= 45 && num <= 130 && !weight) weight = num;
            }
        }
    }
    
    const perks = {};
    for (let i = 0; i < 5; i++) {
        if (matchData[`match_event_aggregate_${i}`] !== undefined) {
            perks[`event_${i}`] = matchData[`match_event_aggregate_${i}`];
        }
    }
    if (matchData.vprohackreason) perks.hackreason = matchData.vprohackreason;

    return { height, weight, perks, vproattr: matchData.vproattr || null };
}

function extractMatchInfo(match, clubId) {
    const clubs = match.clubs || {};
    const club = clubs[String(clubId)] || {};
    const opponentId = Object.keys(clubs).find(id => id !== String(clubId));
    const opponent = opponentId ? clubs[opponentId] : {};

    let ourGoals = parseInt(club.goals || 0);
    let oppGoals = parseInt(opponent.goals || 0);

    // Detectar si es un 3-0 DNF fantasma de EA
    if ((ourGoals === 3 && oppGoals === 0) || (ourGoals === 0 && oppGoals === 3)) {
        const getVal = (obj, ...keys) => {
            for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
            return 0;
        };

        let maxGoalsConceded = 0;
        if (match.players && match.players[String(clubId)]) {
            Object.values(match.players[String(clubId)]).forEach(p => {
                const conceded = getVal(p, 'goalsconceded', 'goalsConceded');
                if (conceded > maxGoalsConceded) maxGoalsConceded = conceded;
            });
        }
        let maxOppGoalsConceded = 0;
        if (match.players && opponentId && match.players[opponentId]) {
            Object.values(match.players[opponentId]).forEach(p => {
                const conceded = getVal(p, 'goalsconceded', 'goalsConceded');
                if (conceded > maxOppGoalsConceded) maxOppGoalsConceded = conceded;
            });
        }
        
        let trueOurGoals = maxOppGoalsConceded;
        let trueOppGoals = maxGoalsConceded;
        
        if (trueOurGoals === 0 && trueOppGoals === 0) {
            let realOur = 0, realOpp = 0;
            if (match.players && match.players[String(clubId)]) {
                realOur = Object.values(match.players[String(clubId)]).reduce((s, p) => s + getVal(p, 'goals'), 0);
            }
            if (match.players && opponentId && match.players[opponentId]) {
                realOpp = Object.values(match.players[opponentId]).reduce((s, p) => s + getVal(p, 'goals'), 0);
            }
            if (realOur > 0 || realOpp > 0) {
                trueOurGoals = realOur;
                trueOppGoals = realOpp;
            }
        }

        if (ourGoals !== trueOurGoals || oppGoals !== trueOppGoals) {
            ourGoals = trueOurGoals;
            oppGoals = trueOppGoals;
        }
    }

    return { ourGoals, oppGoals };
}

async function updatePlayerProfile(coll, playerName, matchData, clubName, goalsAgainstThisMatch = 0, isWin = 0, isTie = 0, matchDate, playerLatestInfo) {
    const pos = resolvePos(matchData.pos, matchData.archetypeid);
    const isGK = pos === 'POR';

    const getVal = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
        return 0;
    };

    const isLoss = (isWin === 0 && isTie === 0) ? 1 : 0;

    const incrementData = {
        'stats.matchesPlayed': 1,
        'stats.goals': getVal(matchData, 'goals'),
        'stats.assists': getVal(matchData, 'assists'),
        'stats.passesMade': getVal(matchData, 'passesMade', 'passesmade', 'passescompleted'),
        'stats.passesAttempted': getVal(matchData, 'passesAttempted', 'passesattempted', 'passattempts'),
        'stats.tacklesMade': getVal(matchData, 'tacklesMade', 'tacklesmade', 'tacklescompleted'),
        'stats.tacklesAttempted': getVal(matchData, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts'),
        'stats.shots': getVal(matchData, 'shots'),
        'stats.shotsOnTarget': getVal(matchData, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal'),
        'stats.interceptions': getVal(matchData, 'interceptions'),
        'stats.saves': getVal(matchData, 'saves'),
        'stats.redCards': getVal(matchData, 'redCards', 'redcards'),
        'stats.yellowCards': getVal(matchData, 'yellowCards', 'yellowcards'),
        'stats.mom': getVal(matchData, 'mom'),
        'stats.cleanSheets': (goalsAgainstThisMatch === 0) ? 1 : 0,
        'stats.goalsConceded': isGK ? goalsAgainstThisMatch : 0,
        'stats.wins': isWin,
        'stats.losses': isLoss,
        'stats.ties': isTie
    };

    const rating = parseFloat(matchData.rating || 0);
    const build = extractBuild(matchData);

    const matchTimestamp = matchDate.getTime();
    const currentLatest = playerLatestInfo.get(playerName);
    if (!currentLatest || matchTimestamp > currentLatest.timestamp) {
        playerLatestInfo.set(playerName, {
            clubName,
            matchDate,
            pos,
            build,
            timestamp: matchTimestamp
        });
    }

    await coll.updateOne(
        { eaPlayerName: playerName },
        { 
            $inc: incrementData,
            $push: { 'stats.ratings': rating }
        },
        { upsert: true }
    );
}

async function updatePlayerProfileRatingOnly(coll, playerName, matchData, clubName, matchDate, playerLatestInfo) {
    const pos = resolvePos(matchData.pos, matchData.archetypeid);
    const rating = parseFloat(matchData.rating || 0);
    const build = extractBuild(matchData);
    
    const matchTimestamp = matchDate.getTime();
    const currentLatest = playerLatestInfo.get(playerName);
    if (!currentLatest || matchTimestamp > currentLatest.timestamp) {
        playerLatestInfo.set(playerName, {
            clubName,
            matchDate,
            pos,
            build,
            timestamp: matchTimestamp
        });
    }

    await coll.updateOne(
        { eaPlayerName: playerName },
        { 
            $push: { 'stats.ratings': rating }
        },
        { upsert: true }
    );
}

async function updateClubProfile(coll, clubId, clubName, matchClubData, matchData, isWin = 0, isTie = 0, isLoss = 0) {
    const info = extractMatchInfo(matchData, clubId);
    const ourGoals = info.ourGoals;
    
    const gv = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return parseInt(obj[k]) || 0; }
        return 0;
    };
    const gf = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return parseFloat(obj[k]) || 0; }
        return 0;
    };

    let teamShots = 0, teamShotsOT = 0, teamPassesMade = 0, teamPassesAtt = 0, teamTacklesMade = 0, teamTacklesAtt = 0;
    if (matchData.players && matchData.players[clubId]) {
        for (const pid in matchData.players[clubId]) {
            const p = matchData.players[clubId][pid];
            teamShots += gv(p, 'shots');
            teamShotsOT += gv(p, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal');
            teamPassesMade += gv(p, 'passesMade', 'passesmade', 'passescompleted');
            teamPassesAtt += gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
            teamTacklesMade += gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
            teamTacklesAtt += gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
        }
    }

    const clubShots = gv(matchClubData, 'shots');
    const clubPassesMade = gv(matchClubData, 'passesMade', 'passesmade');

    const incrementData = {
        'stats.matchesPlayed': 1,
        'stats.wins': isWin,
        'stats.losses': isLoss,
        'stats.ties': isTie,
        'stats.goals': ourGoals,
        'stats.goalsAgainst': gv(matchClubData, 'goalsAgainst', 'goalsagainst'),
        'stats.shots': clubShots || teamShots,
        'stats.shotsOnTarget': gv(matchClubData, 'shotsOnTarget', 'shotsontarget', 'shotsongoal') || teamShotsOT,
        'stats.passesMade': clubPassesMade || teamPassesMade,
        'stats.passesAttempted': gv(matchClubData, 'passesAttempted', 'passesattempted') || teamPassesAtt,
        'stats.tacklesMade': gv(matchClubData, 'tacklesMade', 'tacklesmade') || teamTacklesMade,
        'stats.tacklesAttempted': gv(matchClubData, 'tacklesAttempted', 'tacklesattempted') || teamTacklesAtt,
        'stats.possession': gf(matchClubData, 'possession'),
        'stats.possessionCount': 1
    };

    await coll.updateOne(
        { eaClubId: clubId },
        {
            $set: { eaClubName: clubName, lastActive: new Date() },
            $inc: incrementData
        },
        { upsert: true }
    );
}

function groupMatchesByOpponent(matches, clubId) {
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

            if (nextOpponentId === opponentId && timeDiff < 3 * 3600) {
                group.push(nextMatch);
                used.add(j);
            }
        }

        groups.push(group);
    }

    return groups;
}

function findBestSession(group, clubId) {
    if (group.length === 1) return group[0];

    let best = group[0];
    let bestScore = 0;

    for (const match of group) {
        let maxSecs = 0;
        let hasRealStats = false;

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
        if (score > bestScore) {
            bestScore = score;
            best = match;
        }
    }

    return best;
}

function aggregateGroupStats(group, clubId) {
    let totalGoals = 0;
    let totalGoalsAgainst = 0;
    let maxSecs = 0;
    const aggregatedPlayers = {};

    const getVal = (obj, ...keys) => {
        for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; }
        return 0;
    };

    for (const match of group) {
        const clubStats = match.clubs && match.clubs[String(clubId)] ? match.clubs[String(clubId)] : {};
        let goals = parseInt(clubStats.goals || 0);
        let goalsAgainst = parseInt(clubStats.goalsAgainst || 0);

        const opponentId = Object.keys(match.clubs || {}).find(id => id !== String(clubId));

        if ((goals === 3 && goalsAgainst === 0) || (goals === 0 && goalsAgainst === 3)) {
            let maxGoalsConceded = 0;
            if (match.players && match.players[String(clubId)]) {
                Object.values(match.players[String(clubId)]).forEach(p => {
                    const conceded = getVal(p, 'goalsconceded', 'goalsConceded');
                    if (conceded > maxGoalsConceded) maxGoalsConceded = conceded;
                });
            }
            let maxOppGoalsConceded = 0;
            if (match.players && opponentId && match.players[opponentId]) {
                Object.values(match.players[opponentId]).forEach(p => {
                    const conceded = getVal(p, 'goalsconceded', 'goalsConceded');
                    if (conceded > maxOppGoalsConceded) maxOppGoalsConceded = conceded;
                });
            }
            
            let trueOurGoals = maxOppGoalsConceded;
            let trueOppGoals = maxGoalsConceded;
            
            if (trueOurGoals === 0 && trueOppGoals === 0) {
                let realOur = 0, realOpp = 0;
                if (match.players && match.players[String(clubId)]) {
                    realOur = Object.values(match.players[String(clubId)]).reduce((s, p) => s + getVal(p, 'goals'), 0);
                }
                if (match.players && opponentId && match.players[opponentId]) {
                    realOpp = Object.values(match.players[opponentId]).reduce((s, p) => s + getVal(p, 'goals'), 0);
                }
                if (realOur > 0 || realOpp > 0) {
                    trueOurGoals = realOur;
                    trueOppGoals = realOpp;
                }
            }

            if (goals !== trueOurGoals || goalsAgainst !== trueOppGoals) {
                goals = trueOurGoals;
                goalsAgainst = trueOppGoals;
            }
        }

        totalGoals += goals;
        totalGoalsAgainst += goalsAgainst;

        if (match.players && match.players[String(clubId)]) {
            const playersData = match.players[String(clubId)];
            for (const playerId in playersData) {
                const player = playersData[playerId];
                const playerName = player.playername || player.playerName || playerId;
                const secs = parseInt(player.secondsPlayed || player.secondsplayed || 0);
                const rating = parseFloat(player.rating || 0);

                if (secs > maxSecs) maxSecs = secs;

                if (!aggregatedPlayers[playerName]) {
                    aggregatedPlayers[playerName] = {
                        playername: playerName,
                        pos: player.pos,
                        archetypeid: player.archetypeid,
                        goals: 0,
                        assists: 0,
                        passesMade: 0,
                        passesAttempted: 0,
                        tacklesMade: 0,
                        tacklesAttempted: 0,
                        shots: 0,
                        shotsOnTarget: 0,
                        interceptions: 0,
                        saves: 0,
                        redCards: 0,
                        yellowCards: 0,
                        mom: 0,
                        _bestRating: rating,
                        _maxRatingSecs: secs,
                        vproattr: player.vproattr
                    };
                } else {
                    if (secs > aggregatedPlayers[playerName]._maxRatingSecs) {
                        aggregatedPlayers[playerName]._maxRatingSecs = secs;
                        aggregatedPlayers[playerName]._bestRating = rating;
                        aggregatedPlayers[playerName].pos = player.pos;
                        aggregatedPlayers[playerName].archetypeid = player.archetypeid;
                        if (player.vproattr) aggregatedPlayers[playerName].vproattr = player.vproattr;
                    }
                }

                aggregatedPlayers[playerName].goals += getVal(player, 'goals');
                aggregatedPlayers[playerName].assists += getVal(player, 'assists');
                aggregatedPlayers[playerName].passesMade += getVal(player, 'passesMade', 'passesmade', 'passescompleted');
                aggregatedPlayers[playerName].passesAttempted += getVal(player, 'passesAttempted', 'passesattempted', 'passattempts');
                aggregatedPlayers[playerName].tacklesMade += getVal(player, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                aggregatedPlayers[playerName].tacklesAttempted += getVal(player, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                aggregatedPlayers[playerName].shots += getVal(player, 'shots');
                aggregatedPlayers[playerName].shotsOnTarget += getVal(player, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal');
                aggregatedPlayers[playerName].interceptions += getVal(player, 'interceptions');
                aggregatedPlayers[playerName].saves += getVal(player, 'saves');
                aggregatedPlayers[playerName].redCards += getVal(player, 'redCards', 'redcards');
                aggregatedPlayers[playerName].yellowCards += getVal(player, 'yellowCards', 'yellowcards');
                aggregatedPlayers[playerName].mom = Math.max(aggregatedPlayers[playerName].mom, getVal(player, 'mom'));
            }
        }
    }

    for (const playerName in aggregatedPlayers) {
        const p = aggregatedPlayers[playerName];
        p.rating = p._bestRating;
        delete p._bestRating;
        delete p._maxRatingSecs;
    }

    return {
        goals: totalGoals,
        goalsAgainst: totalGoalsAgainst,
        maxSecs,
        players: aggregatedPlayers
    };
}

function calculatePlayerPointsAndPrice(p) {
    const stats = p.stats || {};
    const ratings = stats.ratings || [];
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 6.0;

    let price;
    if (p.manualPrice !== undefined && p.manualPrice !== null) {
        price = p.manualPrice;
    } else {
        price = 1000000;
        price += (stats.goals || 0) * 250000;
        price += (stats.assists || 0) * 200000;
        const posUpper = (p.lastPosition || '').toUpperCase();
        const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR'].includes(posUpper);
        if (isDefOrGk) price += (stats.cleanSheets || 0) * 150000;
        
        price += (stats.wins || 0) * 50000;
        price -= (stats.losses || 0) * 25000;

        if (avgRating > 6.0) price *= (1 + (avgRating - 6.0) * 0.5);
        price = Math.min(15000000, Math.max(500000, price));
        price = Math.round(price / 10000) * 10000;
    }

    let points = 0;
    const goals = stats.goals || 0;
    const assists = stats.assists || 0;
    const cleanSheets = stats.cleanSheets || 0;
    const posUpper = (p.lastPosition || '').toUpperCase();
    const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR'].includes(posUpper);
    
    if (['DC', 'ED', 'EI', 'MP'].includes(posUpper)) points += goals * 4;
    else if (['MC', 'MCD', 'MCO', 'MD', 'MI', 'CARR'].includes(posUpper)) points += goals * 5;
    else points += goals * 6;
    
    points += assists * 3;
    
    if (isDefOrGk) points += cleanSheets * 4;
    else if (['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(posUpper)) points += cleanSheets * 1;
    
    for (const r of ratings) {
        if (r >= 9.0) points += 6;
        else if (r >= 8.0) points += 4;
        else if (r >= 7.0) points += 2;
        else if (r >= 6.0) points += 1;
    }
    
    points -= (stats.yellowCards || 0) * 1;
    points -= (stats.redCards || 0) * 3;

    points += (stats.wins || 0) * 3;
    points += (stats.ties || 0) * 1;
    points -= (stats.losses || 0) * 2;

    return { price, points, avgRating };
}

async function rebuild() {
    console.log('[REBUILD] Conectando a la base de datos...');
    await connectDb();
    const db = getDb();
    
    const playerColl = db.collection('player_profiles');
    const clubColl = db.collection('club_profiles');
    
    const playerLatestInfo = new Map();
    
    console.log('[REBUILD] Reseteando estadísticas de perfiles de jugadores...');
    const initialStats = {
        matchesPlayed: 0,
        goals: 0,
        assists: 0,
        passesMade: 0,
        passesAttempted: 0,
        tacklesMade: 0,
        tacklesAttempted: 0,
        shots: 0,
        shotsOnTarget: 0,
        interceptions: 0,
        saves: 0,
        redCards: 0,
        yellowCards: 0,
        mom: 0,
        cleanSheets: 0,
        goalsConceded: 0,
        ratings: [],
        wins: 0,
        losses: 0,
        ties: 0
    };
    const resetPlayersResult = await playerColl.updateMany({}, {
        $set: { stats: initialStats }
    });
    console.log(`[REBUILD] ${resetPlayersResult.modifiedCount} jugadores reseteados.`);

    console.log('[REBUILD] Reseteando estadísticas de perfiles de clubes...');
    const initialClubStats = {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        goals: 0,
        goalsAgainst: 0,
        shots: 0,
        shotsOnTarget: 0,
        passesMade: 0,
        passesAttempted: 0,
        tacklesMade: 0,
        tacklesAttempted: 0,
        possession: 0,
        possessionCount: 0
    };
    const resetClubsResult = await clubColl.updateMany({}, {
        $set: { stats: initialClubStats }
    });
    console.log(`[REBUILD] ${resetClubsResult.modifiedCount} clubes reseteados.`);

    console.log('[REBUILD] Cargando todos los equipos competitivos de VPG...');
    const teams = await getDb('test').collection('teams').find({ eaClubId: { $ne: null } }).toArray();
    console.log(`[REBUILD] Encontrados ${teams.length} equipos.`);

    let totalSessionsProcessed = 0;

    for (const team of teams) {
        const clubId = team.eaClubId;
        console.log(`[REBUILD] Procesando historial del equipo: ${team.name} (ClubID: ${clubId})...`);

        const query = { [`clubs.${clubId}`]: { $exists: true } };
        const matches = await db.collection('scanned_matches').find(query).toArray();
        console.log(`[REBUILD] Encontrados ${matches.length} partidos individuales en historial para ${team.name}`);

        if (matches.length === 0) continue;

        // Agrupar e integrar cronológicamente
        const sortedMatches = matches.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
        const groups = groupMatchesByOpponent(sortedMatches, clubId);
        console.log(`[REBUILD] Fusión DNF: ${matches.length} sesiones consolidadas en ${groups.length} partidos vs rivales únicos.`);

        for (const group of groups) {
            const aggregated = aggregateGroupStats(group, clubId);
            const isShortMatch = aggregated.maxSecs > 0 && aggregated.maxSecs < 5200;

            const isWin = aggregated.goals > aggregated.goalsAgainst ? 1 : 0;
            const isTie = aggregated.goals === aggregated.goalsAgainst ? 1 : 0;
            const isLoss = (isWin === 0 && isTie === 0) ? 1 : 0;

            const bestMatch = findBestSession(group, clubId);
            const matchDate = new Date(parseInt(bestMatch.timestamp) * 1000);

            // Process players
            for (const playerName in aggregated.players) {
                const player = aggregated.players[playerName];
                const pm = player.passesMade || 0;
                const sh = player.shots || 0;
                const tk = player.tacklesMade || 0;
                const hasRealStats = (pm + sh + tk) > 0;

                if (isShortMatch && !hasRealStats) {
                    await updatePlayerProfileRatingOnly(playerColl, playerName, player, team.name, matchDate, playerLatestInfo);
                } else {
                    await updatePlayerProfile(playerColl, playerName, player, team.name, aggregated.goalsAgainst, isWin, isTie, matchDate, playerLatestInfo);
                }
            }

            // Process club
            if (bestMatch.clubs && bestMatch.clubs[clubId]) {
                const clubStats = {
                    ...bestMatch.clubs[clubId],
                    goals: String(aggregated.goals),
                    goalsAgainst: String(aggregated.goalsAgainst)
                };
                await updateClubProfile(clubColl, clubId, team.name, clubStats, bestMatch, isWin, isTie, isLoss);
            }
            
            totalSessionsProcessed += group.length;
        }
    }

    console.log(`\n[REBUILD] Reconstrucción de estadísticas completada (${totalSessionsProcessed} sesiones procesadas).`);

    console.log(`\n[REBUILD] Actualizando club activo, última fecha de actividad, posición y build para ${playerLatestInfo.size} jugadores...`);
    const bulkOps = [];
    for (const [playerName, info] of playerLatestInfo.entries()) {
        bulkOps.push({
            updateOne: {
                filter: { eaPlayerName: playerName },
                update: {
                    $set: {
                        lastClub: info.clubName,
                        lastActive: info.matchDate,
                        lastPosition: info.pos,
                        build: info.build
                    }
                }
            }
        });
        if (bulkOps.length >= 1000) {
            await playerColl.bulkWrite(bulkOps);
            bulkOps.length = 0;
        }
    }
    if (bulkOps.length > 0) {
        await playerColl.bulkWrite(bulkOps);
    }
    console.log('[REBUILD] Información de clubes y actividad de jugadores actualizada correctamente.');

    // Recalcular puntos de todas las ligas
    console.log('\n[REBUILD] Iniciando recálculo global de ligas de Fantasy...');
    const leagues = await db.collection('fantasy_leagues').find().toArray();
    console.log(`[REBUILD] Encontradas ${leagues.length} ligas.`);

    for (const league of leagues) {
        console.log(`[REBUILD] Recalculando liga: ${league.name} (${league._id})...`);
        const fantasyTeams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
        console.log(`[REBUILD] Recalculando puntos para ${fantasyTeams.length} equipos en la liga...`);

        for (const fTeam of fantasyTeams) {
            let totalPoints = 0;
            for (const playerName of (fTeam.players || [])) {
                const player = await playerColl.findOne({ eaPlayerName: playerName });
                if (player) {
                    const { points } = calculatePlayerPointsAndPrice(player);
                    totalPoints += points;
                }
            }
            await db.collection('fantasy_teams').updateOne(
                { _id: fTeam._id },
                { $set: { points: totalPoints } }
            );
            console.log(`   └─ Equipo "${fTeam.teamName}" recalculado: ${totalPoints} puntos.`);
        }
    }

    console.log('\n[REBUILD] ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
    process.exit(0);
}

rebuild().catch(async (err) => {
    console.error('[REBUILD] ERROR CRÍTICO:', err);
    process.exit(1);
});
