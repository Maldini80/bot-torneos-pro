import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO PERFILES ---');
        const mainPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: 'Uriii-07-' });
        const dupPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: 'ublaya777' });
        
        if (!mainPlayer) {
            console.error('Perfil Uriii-07- no encontrado.');
            return;
        }
        if (!dupPlayer) {
            console.error('Perfil ublaya777 no encontrado.');
            return;
        }

        const mainPlayerNameExact = mainPlayer.eaPlayerName; // Uriii-07-
        const dupPlayerNameExact = dupPlayer.eaPlayerName; // ublaya777

        console.log(`Fusionando ${dupPlayerNameExact} en ${mainPlayerNameExact}...`);

        // 1. Combinar estadísticas
        const mergedStats = {};
        const mainStats = mainPlayer.stats || {};
        const dupStats = dupPlayer.stats || {};

        const statsFields = [
            'matchesPlayed', 'goals', 'assists', 'passesMade', 'passesAttempted',
            'tacklesMade', 'tacklesAttempted', 'shots', 'shotsOnTarget', 'interceptions',
            'saves', 'redCards', 'yellowCards', 'mom', 'cleanSheets', 'goalsConceded',
            'wins', 'losses', 'ties'
        ];

        for (const field of statsFields) {
            mergedStats[field] = (mainStats[field] || 0) + (dupStats[field] || 0);
        }

        mergedStats.ratings = [ ...(mainStats.ratings || []), ...(dupStats.ratings || []) ];
        mergedStats.vpgPoints = Math.max(mainStats.vpgPoints || 0, dupStats.vpgPoints || 0);

        let lastClub = mainPlayer.lastClub || dupPlayer.lastClub;
        let vpgLeagueSlug = mainPlayer.vpgLeagueSlug || dupPlayer.vpgLeagueSlug;

        if (mainPlayer.lastActive && dupPlayer.lastActive) {
            const mainTime = new Date(mainPlayer.lastActive).getTime();
            const dupTime = new Date(dupPlayer.lastActive).getTime();
            if (dupTime > mainTime && dupPlayer.lastClub) {
                lastClub = dupPlayer.lastClub;
                vpgLeagueSlug = dupPlayer.vpgLeagueSlug || mainPlayer.vpgLeagueSlug;
            }
        }

        const updateDoc = {
            stats: mergedStats,
            vpgLeagueSlug,
            lastPosition: mainPlayer.lastPosition || dupPlayer.lastPosition,
            lastClub,
            avatar: mainPlayer.avatar || dupPlayer.avatar,
            nationality: mainPlayer.nationality || dupPlayer.nationality,
            manualPrice: mainPlayer.manualPrice !== undefined && mainPlayer.manualPrice !== null ? mainPlayer.manualPrice : dupPlayer.manualPrice,
            manualPosition: mainPlayer.manualPosition !== undefined && mainPlayer.manualPosition !== null ? mainPlayer.manualPosition : dupPlayer.manualPosition,
            vpgProfile: {
                username: "ublaya777",
                psn: "Uriii-07-",
                origin: null,
                xbox: null,
                lastChecked: new Date()
            }
        };

        // Eliminar campos null/undefined
        Object.keys(updateDoc).forEach(key => (updateDoc[key] === undefined || updateDoc[key] === null) && delete updateDoc[key]);

        // Guardar cambios en el principal y eliminar duplicado
        await db.collection('player_profiles').updateOne({ _id: mainPlayer._id }, { $set: updateDoc });
        await db.collection('player_profiles').deleteOne({ _id: dupPlayer._id });

        // 2. Reemplazar nombre en fantasy_teams (players, lineup, clauses, clausesProtectedUntil)
        const affectedTeams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        }).toArray();

        for (const team of affectedTeams) {
            const updatedPlayers = team.players.map(p => {
                if (p.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                    return mainPlayerNameExact;
                }
                return p;
            });

            const updatedLineup = { ...team.lineup };
            for (const pos in updatedLineup) {
                if (Array.isArray(updatedLineup[pos])) {
                    updatedLineup[pos] = updatedLineup[pos].map(p => {
                        if (p && p.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                            return mainPlayerNameExact;
                        }
                        return p;
                    });
                } else if (updatedLineup[pos] && updatedLineup[pos].toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                    updatedLineup[pos] = mainPlayerNameExact;
                }
            }

            const updatedClauses = { ...team.clauses || {} };
            const updatedClausesProtected = { ...team.clausesProtectedUntil || {} };
            
            const clauseKey = Object.keys(updatedClauses).find(k => k.toLowerCase() === dupPlayerNameExact.toLowerCase());
            if (clauseKey) {
                updatedClauses[mainPlayerNameExact] = updatedClauses[clauseKey];
                delete updatedClauses[clauseKey];
            }
            const protectKey = Object.keys(updatedClausesProtected).find(k => k.toLowerCase() === dupPlayerNameExact.toLowerCase());
            if (protectKey) {
                updatedClausesProtected[mainPlayerNameExact] = updatedClausesProtected[protectKey];
                delete updatedClausesProtected[protectKey];
            }

            await db.collection('fantasy_teams').updateOne(
                { _id: team._id },
                {
                    $set: {
                        players: updatedPlayers,
                        lineup: updatedLineup,
                        clauses: updatedClauses,
                        clausesProtectedUntil: updatedClausesProtected
                    }
                }
            );
        }

        // 3. Reemplazar nombre en fantasy_market_listings y fantasy_market_bids
        await db.collection('fantasy_market_listings').updateMany(
            { eaPlayerName: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
            { $set: { eaPlayerName: mainPlayerNameExact } }
        );

        await db.collection('fantasy_market_bids').updateMany(
            { eaPlayerName: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
            { $set: { eaPlayerName: mainPlayerNameExact } }
        );

        // 4. Reemplazar nombre en fantasy_leagues (marketFreeAgents y basePoints)
        const affectedLeagues = await db.collection('fantasy_leagues').find({
            $or: [
                { marketFreeAgents: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                { [`basePoints.${dupPlayerNameExact}`]: { $exists: true } }
            ]
        }).toArray();

        for (const league of affectedLeagues) {
            const updateOps = {};
            
            if (Array.isArray(league.marketFreeAgents)) {
                updateOps.marketFreeAgents = league.marketFreeAgents.map(p => {
                    if (p.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                        return mainPlayerNameExact;
                    }
                    return p;
                });
            }
            
            if (league.basePoints) {
                const updatedBasePoints = { ...league.basePoints };
                const baseKey = Object.keys(updatedBasePoints).find(k => k.toLowerCase() === dupPlayerNameExact.toLowerCase());
                if (baseKey) {
                    updatedBasePoints[mainPlayerNameExact] = updatedBasePoints[baseKey];
                    delete updatedBasePoints[baseKey];
                    updateOps.basePoints = updatedBasePoints;
                }
            }

            await db.collection('fantasy_leagues').updateOne(
                { _id: league._id },
                { $set: updateOps }
            );
        }

        console.log('MANUAL MERGE COMPLETED SUCCESS.');

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
