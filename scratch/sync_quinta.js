import dns from 'dns';
dns.setServers(['8.8.8.8']); // Google DNS for resolving Mongo SRV

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARD_POS_MAP = {
    'top_gk': 'POR',
    'top_cb': 'DFC',
    'top_fb': 'CARR',
    'top_cdm': 'MC',
    'top_cam': 'MC',
    'top_wingers': 'CARR',
    'top_strikers': 'DC'
};

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/esports|cf|fc|gaming/g, '')
        .trim();
}

function findDbTeam(vpgTeam, dbTeams) {
    const vpgSlug = String(vpgTeam.team_slug || '').toLowerCase().trim();
    const vpgName = String(vpgTeam.team_name || '').toLowerCase().trim();
    
    let match = dbTeams.find(t => String(t.vpgTeamSlug || '').toLowerCase().trim() === vpgSlug);
    if (match) return match;
    
    match = dbTeams.find(t => String(t.vpgTeamSlug || '').toLowerCase().trim() === String(vpgTeam.team_abbr || '').toLowerCase().trim());
    if (match) return match;

    const normVpgName = normalizeName(vpgTeam.team_name);
    match = dbTeams.find(t => normalizeName(t.name) === normVpgName);
    if (match) return match;

    const normVpgSlug = normalizeName(vpgTeam.team_slug);
    match = dbTeams.find(t => normalizeName(t.vpgTeamSlug) === normVpgSlug);
    if (match) return match;

    return null;
}

function calculatePlayerPointsAndPrice(p) {
    const s = p.stats || {};
    const matchesPlayed = s.matchesPlayed || 0;
    
    const goals = s.goals || 0;
    const assists = s.assists || 0;
    const saves = s.saves || 0;
    const cleanSheets = s.cleanSheets || 0;
    const redCards = s.redCards || 0;
    const yellowCards = s.yellowCards || 0;
    const wins = s.wins || 0;
    const losses = s.losses || 0;
    const ties = s.ties || 0;

    let points = s.vpgPoints || 0;
    
    // Scale price by points and avg rating
    const ratings = s.ratings || [];
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 6.0;

    let price = 5000000;
    if (points > 0) {
        price += points * 80000;
    }
    if (avgRating > 6.0) {
        price += (avgRating - 6.0) * 1000000;
    }

    price = Math.min(80000000, Math.max(2600000, price));
    price = Math.round(price / 50000) * 50000;

    return { points, price, avgRating };
}

async function run() {
    const client = await MongoClient.connect(process.env.DATABASE_URL);
    const db = client.db('tournamentBotDb');
    const testDb = client.db('test');
    
    const playerColl = db.collection('player_profiles');
    const clubColl = db.collection('club_profiles');

    const targetLeagues = ['quinta-division-c', 'quinta-division-d'];
    
    console.log(`Connecting to database, target leagues: ${targetLeagues.join(', ')}`);
    
    const dbTeams = await testDb.collection('teams').find({ vpgLeagueSlug: { $in: targetLeagues } }).toArray();
    console.log(`Cargados ${dbTeams.length} equipos de la DB.`);

    const vpgTeamToDbMap = new Map();
    const teamStandingsMap = new Map();

    let totalPlayersUpdated = 0;
    
    for (const leagueSlug of targetLeagues) {
        console.log(`\n--- SINCRONIZANDO DIVISION: ${leagueSlug} ---`);
        
        // Quitar vpgLeagueSlug de los jugadores de esta liga especifica
        await playerColl.updateMany(
            { vpgLeagueSlug: leagueSlug },
            { $unset: { vpgLeagueSlug: "" } }
        );

        const tableUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/table/`;
        let standings = [];
        try {
            const res = await fetch(tableUrl, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                standings = Array.isArray(data) ? data : (data.data || data.results || []);
            }
        } catch (e) {
            console.error(`Error fetching table for ${leagueSlug}:`, e.message);
        }

        console.log(`Tabla obtenida: ${standings.length} equipos.`);

        for (const vpgTeam of standings) {
            const teamSlugLower = String(vpgTeam.team_slug || '').toLowerCase().trim();
            const teamNameLower = String(vpgTeam.team_name || '').toLowerCase().trim();

            if (teamSlugLower) teamStandingsMap.set(teamSlugLower, vpgTeam);
            if (teamNameLower) teamStandingsMap.set(teamNameLower, vpgTeam);

            const dbTeam = findDbTeam(vpgTeam, dbTeams);
            if (dbTeam) {
                vpgTeamToDbMap.set(teamSlugLower, dbTeam);
                vpgTeamToDbMap.set(teamNameLower, dbTeam);
            }
        }

        const leaguePlayersMap = new Map();

        for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                const leaderboardUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=30&offset=${offset}`;
                let pagePlayers = [];
                try {
                    const res = await fetch(leaderboardUrl, { headers: HEADERS });
                    if (res.ok) {
                        const data = await res.json();
                        pagePlayers = data.data || [];
                        if (!Array.isArray(pagePlayers) || pagePlayers.length < 30) {
                            hasMore = false;
                        }
                    } else {
                        hasMore = false;
                    }
                } catch (e) {
                    hasMore = false;
                }

                if (pagePlayers.length > 0) {
                    for (const player of pagePlayers) {
                        const pSlug = String(player.team_slug || '').toLowerCase().trim();
                        const pName = String(player.team_name || '').toLowerCase().trim();
                        const username = player.username;
                        if (!username) continue;

                        const played = player.matches_played || 0;
                        const ratingSum = player.match_rating || 0;
                        const avgRating = played > 0 ? (ratingSum / played) : 6.0;

                        const standing = teamStandingsMap.get(pSlug) || teamStandingsMap.get(pName);
                        let wins = 0, losses = 0, ties = 0;
                        if (standing) {
                            const ratio = (standing.played && standing.played > 0) ? Math.min(1, played / standing.played) : 1;
                            wins = Math.round((standing.wins || 0) * ratio);
                            ties = Math.round((standing.draws || 0) * ratio);
                            losses = Math.round((standing.losses || 0) * ratio);
                        }

                        const usernameLower = username.toLowerCase();
                        if (leaguePlayersMap.has(usernameLower)) {
                            const existing = leaguePlayersMap.get(usernameLower);
                            const existingStats = existing.stats;

                            if (existing.lastPosition === fantasyPos) {
                                if ((parseFloat(player.points) || 0) > (existingStats.vpgPoints || 0) || pSlug !== existing.vpgTeamSlug) {
                                    existingStats.matchesPlayed = played;
                                    existingStats.goals = parseInt(player.goals) || 0;
                                    existingStats.assists = parseInt(player.assists) || 0;
                                    existingStats.shots = parseInt(player.shots) || 0;
                                    existingStats.saves = parseInt(player.saves) || 0;
                                    existingStats.redCards = parseInt(player.red_card) || 0;
                                    existingStats.yellowCards = parseInt(player.yellow_card) || 0;
                                    existingStats.cleanSheets = parseInt(player.clean_sheet) || 0;
                                    existingStats.ratings = Array(played).fill(avgRating);
                                    existingStats.wins = wins;
                                    existingStats.losses = losses;
                                    existingStats.ties = ties;
                                    existingStats.vpgPoints = parseFloat(player.points) || 0;
                                    existing.vpgTeamSlug = pSlug;
                                }
                            }
                        } else {
                            const playerStats = {
                                matchesPlayed: played,
                                goals: parseInt(player.goals) || 0,
                                assists: parseInt(player.assists) || 0,
                                passesMade: 0,
                                passesAttempted: 0,
                                tacklesMade: 0,
                                tacklesAttempted: 0,
                                shots: parseInt(player.shots) || 0,
                                shotsOnTarget: 0,
                                interceptions: 0,
                                saves: parseInt(player.saves) || 0,
                                redCards: parseInt(player.red_card) || 0,
                                yellowCards: parseInt(player.yellow_card) || 0,
                                mom: 0,
                                cleanSheets: parseInt(player.clean_sheet) || 0,
                                goalsConceded: 0,
                                ratings: Array(played).fill(avgRating),
                                wins: wins,
                                losses: losses,
                                ties: ties,
                                vpgPoints: parseFloat(player.points) || 0
                            };

                            leaguePlayersMap.set(usernameLower, {
                                username: username,
                                lastClub: player.team_name || player.team_slug || "VPG Club",
                                lastActive: new Date(),
                                lastPosition: fantasyPos,
                                vpgLeagueSlug: leagueSlug,
                                vpgTeamSlug: pSlug,
                                avatar: player.user_avatar || null,
                                nationality: player.user_nationality || null,
                                stats: playerStats
                            });
                        }
                    }
                }
                offset += 30;
                if (offset >= 1200) hasMore = false;
            }
        }

        console.log(`Guardando ${leaguePlayersMap.size} jugadores agregados para ${leagueSlug}...`);
        for (const [usernameLower, pData] of leaguePlayersMap.entries()) {
            const { username, ...updateData } = pData;
            const usernameEscaped = username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            
            const existingPlayer = await playerColl.findOne({
                $or: [
                    { eaPlayerName: { $regex: new RegExp('^' + usernameEscaped + '$', 'i') } },
                    { "vpgProfile.username": { $regex: new RegExp('^' + usernameEscaped + '$', 'i') } }
                ]
            });

            if (existingPlayer) {
                if (existingPlayer.excluded === true) continue;
                
                // Si ya existe, actualizamos su información sin borrar su ID o vinculación de equipo
                await playerColl.updateOne(
                    { _id: existingPlayer._id },
                    {
                        $set: {
                            vpgLeagueSlug: leagueSlug,
                            vpgTeamSlug: updateData.vpgTeamSlug,
                            lastClub: updateData.lastClub,
                            lastActive: new Date(),
                            lastPosition: updateData.lastPosition,
                            stats: updateData.stats
                        }
                    }
                );
            } else {
                // Si es un jugador completamente nuevo, lo insertamos
                await playerColl.insertOne({
                    eaPlayerName: username,
                    discordId: null,
                    discordUsername: null,
                    teamId: null,
                    teamName: null,
                    manualPosition: null,
                    manualPrice: null,
                    ...updateData
                });
            }
            totalPlayersUpdated++;
        }
    }

    console.log(`\nSincronización finalizada. Total de jugadores procesados/guardados: ${totalPlayersUpdated}`);
    await client.close();
}

run().catch(console.error);
