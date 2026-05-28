import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- RECONSTRUYENDO EL PERFIL OFICIAL DE ublaya777 ---');
        
        // Buscar el perfil actual (que ahora está con nombre Uriii-07-)
        const currentProfile = await db.collection('player_profiles').findOne({
            $or: [
                { eaPlayerName: 'Uriii-07-' },
                { eaPlayerName: 'ublaya777' }
            ]
        });

        if (!currentProfile) {
            console.error('No se encontró el perfil para corregir.');
            return;
        }

        const oldId = currentProfile._id;

        // Limpiar estadísticas: Solo dejamos las de VPG (4 partidos de Columbus Pacers)
        // Eliminamos el partido 6.8 de Bachateros que metió el crawler.
        const vpgRatings = [6.425, 6.425, 6.425, 6.425];
        const vpgStats = {
            matchesPlayed: 4,
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
            ratings: vpgRatings,
            wins: 1,
            losses: 3,
            ties: 1,
            vpgPoints: 30.9
        };

        // Crear el documento limpio de ublaya777
        const cleanProfile = {
            eaPlayerName: 'ublaya777',
            lastActive: new Date(),
            lastClub: 'Columbus Pacers',
            lastPosition: 'CARR',
            stats: vpgStats,
            build: {
                height: null,
                weight: null,
                perks: {},
                vproattr: "NH"
            },
            avatar: "avatar_726bbaef-773a-4064-82e2-bd228f54292e",
            nationality: "ES",
            vpgProfile: {
                username: "ublaya777",
                psn: "Uriii-07-",
                origin: null,
                xbox: null,
                lastChecked: new Date()
            },
            vpgLeagueSlug: "superliga-spain-b",
            vpgTeamSlug: "columbus-pacers"
        };

        // Reemplazar el documento en la base de datos
        await db.collection('player_profiles').deleteOne({ _id: oldId });
        await db.collection('player_profiles').insertOne(cleanProfile);
        console.log('Ficha de player_profiles restaurada a ublaya777 y limpiada con éxito.');

        // Reemplazar Uriii-07- por ublaya777 en todos los equipos del Fantasy
        const affectedTeams = await db.collection('fantasy_teams').find({
            players: { $regex: /^Uriii-07-$/i }
        }).toArray();

        for (const team of affectedTeams) {
            const updatedPlayers = team.players.map(p => {
                if (p.toLowerCase() === 'uriii-07-') return 'ublaya777';
                return p;
            });

            const updatedLineup = { ...team.lineup };
            for (const pos in updatedLineup) {
                if (Array.isArray(updatedLineup[pos])) {
                    updatedLineup[pos] = updatedLineup[pos].map(p => {
                        if (p && p.toLowerCase() === 'uriii-07-') return 'ublaya777';
                        return p;
                    });
                } else if (updatedLineup[pos] && updatedLineup[pos].toLowerCase() === 'uriii-07-') {
                    updatedLineup[pos] = 'ublaya777';
                }
            }

            const updatedClauses = { ...team.clauses || {} };
            const updatedClausesProtected = { ...team.clausesProtectedUntil || {} };
            
            if (updatedClauses['Uriii-07-'] !== undefined) {
                updatedClauses['ublaya777'] = updatedClauses['Uriii-07-'];
                delete updatedClauses['Uriii-07-'];
            }
            if (updatedClausesProtected['Uriii-07-'] !== undefined) {
                updatedClausesProtected['ublaya777'] = updatedClausesProtected['Uriii-07-'];
                delete updatedClausesProtected['Uriii-07-'];
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
            console.log(`Equipo de Fantasy "${team.teamName}" actualizado.`);
        }

        // Reemplazar en listings y bids
        await db.collection('fantasy_market_listings').updateMany(
            { eaPlayerName: { $regex: /^Uriii-07-$/i } },
            { $set: { eaPlayerName: 'ublaya777' } }
        );
        await db.collection('fantasy_market_bids').updateMany(
            { eaPlayerName: { $regex: /^Uriii-07-$/i } },
            { $set: { eaPlayerName: 'ublaya777' } }
        );

        // Reemplazar en fantasy_leagues (marketFreeAgents y basePoints)
        const affectedLeagues = await db.collection('fantasy_leagues').find({
            $or: [
                { marketFreeAgents: { $regex: /^Uriii-07-$/i } },
                { [`basePoints.Uriii-07-`]: { $exists: true } }
            ]
        }).toArray();

        for (const league of affectedLeagues) {
            const updateOps = {};
            if (Array.isArray(league.marketFreeAgents)) {
                updateOps.marketFreeAgents = league.marketFreeAgents.map(p => {
                    if (p.toLowerCase() === 'uriii-07-') return 'ublaya777';
                    return p;
                });
            }
            if (league.basePoints) {
                const updatedBasePoints = { ...league.basePoints };
                if (updatedBasePoints['Uriii-07-'] !== undefined) {
                    updatedBasePoints['ublaya777'] = updatedBasePoints['Uriii-07-'];
                    delete updatedBasePoints['Uriii-07-'];
                    updateOps.basePoints = updatedBasePoints;
                }
            }
            await db.collection('fantasy_leagues').updateOne({ _id: league._id }, { $set: updateOps });
        }

        console.log('--- RESTAURACIÓN DE ublaya777 COMPLETADA CON ÉXITO ---');

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
