import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function migrateStats() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const tournaments = await db.collection('tournaments').find({}).toArray();
        const playerColl = db.collection('player_profiles');
        
        let playersProcessed = 0;

        for (const t of tournaments) {
            const processMatch = async (match) => {
                if (!match.eaStats) return;

                const processClub = async (clubData, teamName) => {
                    if (!clubData || !clubData.players) return;
                    for (const [pName, p] of Object.entries(clubData.players)) {
                        const incrementData = {
                            'stats.matchesPlayed': 1,
                            'stats.goals': parseInt(p.goals || 0),
                            'stats.assists': parseInt(p.assists || 0),
                            'stats.passesMade': parseInt(p.passesMade || 0),
                            'stats.passesAttempted': parseInt(p.passAttempts || 0),
                            'stats.tacklesMade': parseInt(p.tacklesMade || 0),
                            'stats.tacklesAttempted': parseInt(p.tackleAttempts || 0),
                            'stats.redCards': parseInt(p.redCards || 0),
                            'stats.mom': parseInt(p.mom || 0)
                        };
                        const rating = parseFloat(p.rating || 0);

                        await playerColl.updateOne(
                            { eaPlayerName: p.name },
                            {
                                $set: { lastClub: teamName || 'Desconocido', lastActive: new Date() },
                                $inc: incrementData,
                                $push: { 'stats.ratings': rating }
                            },
                            { upsert: true }
                        );
                        playersProcessed++;
                    }
                };

                await processClub(match.eaStats.clubA, match.equipoA?.nombre);
                await processClub(match.eaStats.clubB, match.equipoB?.nombre);
            };

            // Grupos
            if (t.structure?.calendario) {
                for (const group of Object.values(t.structure.calendario)) {
                    for (const match of group) {
                        await processMatch(match);
                    }
                }
            }
            
            // Eliminatorias
            if (t.structure?.eliminatorias) {
                for (const [key, stage] of Object.entries(t.structure.eliminatorias)) {
                    if (key === 'rondaActual') continue;
                    if (Array.isArray(stage)) {
                        for (const match of stage) {
                            await processMatch(match);
                        }
                    } else if (stage) {
                        await processMatch(stage);
                    }
                }
            }
        }

        console.log(`Migración completada. Jugadores procesados (partidos): ${playersProcessed}`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

migrateStats();
