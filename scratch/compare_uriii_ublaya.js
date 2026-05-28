import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const matches = await db.collection('scanned_matches').find({}).toArray();
        console.log(`Total scanned matches: ${matches.length}`);
        
        let uriiiMatches = [];
        let ublayaMatches = [];
        
        for (const m of matches) {
            const playersRoot = m.players || {};
            for (const clubId of Object.keys(playersRoot)) {
                const clubPlayers = playersRoot[clubId] || {};
                for (const playerId of Object.keys(clubPlayers)) {
                    const p = clubPlayers[playerId];
                    const pname = p.playername?.toLowerCase();
                    if (pname === 'uriii-07-') {
                        uriiiMatches.push({
                            matchId: m.matchId,
                            clubId: clubId,
                            timestamp: m.timestamp,
                            date: m.timestamp ? new Date(parseInt(m.timestamp)*1000) : 'N/A',
                            rating: p.rating
                        });
                    }
                    if (pname === 'ublaya777') {
                        ublayaMatches.push({
                            matchId: m.matchId,
                            clubId: clubId,
                            timestamp: m.timestamp,
                            date: m.timestamp ? new Date(parseInt(m.timestamp)*1000) : 'N/A',
                            rating: p.rating
                        });
                    }
                }
            }
        }
        
        console.log(`\n=== PARTIDOS DE Uriii-07- (${uriiiMatches.length}) ===`);
        for (const m of uriiiMatches.slice(0, 10)) {
            const cp = await db.collection('club_profiles').findOne({ eaClubId: m.clubId });
            console.log(`Match: ${m.matchId} | Club: ${cp ? cp.eaClubName : m.clubId} | Fecha: ${m.date} | Rating: ${m.rating}`);
        }
        if (uriiiMatches.length > 10) console.log(`... y ${uriiiMatches.length - 10} partidos más.`);

        console.log(`\n=== PARTIDOS DE ublaya777 (${ublayaMatches.length}) ===`);
        for (const m of ublayaMatches.slice(0, 10)) {
            const cp = await db.collection('club_profiles').findOne({ eaClubId: m.clubId });
            console.log(`Match: ${m.matchId} | Club: ${cp ? cp.eaClubName : m.clubId} | Fecha: ${m.date} | Rating: ${m.rating}`);
        }
        if (ublayaMatches.length > 10) console.log(`... y ${ublayaMatches.length - 10} partidos más.`);
        
        // Check overlap
        const uriiiIds = new Set(uriiiMatches.map(m => m.matchId));
        const ublayaIds = new Set(ublayaMatches.map(m => m.matchId));
        const intersection = [...uriiiIds].filter(id => ublayaIds.has(id));
        console.log(`\nIntersección de partidos (jugaron ambos el mismo partido): ${intersection.length}`);
        for (const id of intersection) {
            console.log(`Match ID común: ${id}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
