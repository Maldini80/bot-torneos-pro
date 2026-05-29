import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        const db = client.db('tournamentBotDb');

        console.log('=== SEARCHING GOLDEN KNIGHTS IN TEAMS ===');
        const teams = await testDb.collection('teams').find({
            $or: [
                { name: /Golden Knights/i },
                { vpgTeamSlug: /golden/i }
            ]
        }).toArray();
        console.log(JSON.stringify(teams.map(t => ({
            name: t.name,
            vpgTeamSlug: t.vpgTeamSlug,
            eaClubId: t.eaClubId,
            eaPlatform: t.eaPlatform,
            vpgLeagueSlug: t.vpgLeagueSlug
        })), null, 2));

        if (teams.length > 0) {
            const eaClubIds = teams.map(t => t.eaClubId).filter(Boolean);
            const eaPlatform = teams[0].eaPlatform;
            console.log(`\nFound EA Club IDs: ${eaClubIds.join(', ')}`);

            console.log('\nSearching scanned_matches by eaClubId/club ID:');
            const matches = await db.collection('scanned_matches').find({
                $or: [
                    { "clubs.33162": { $exists: true } }, // VPG team ID for Golden Knights is 33162
                    { "clubs.33150": { $exists: true } }, // VPG team ID for Rysix Gaming is 33150
                    { "clubId": { $in: eaClubIds } },
                    { "clubA.clubId": { $in: eaClubIds } },
                    { "clubB.clubId": { $in: eaClubIds } },
                    { "clubs": { $in: eaClubIds.map(String) } }
                ]
            }).sort({ timestamp: -1, date: -1 }).limit(10).toArray();

            console.log(`Found ${matches.length} matches.`);
            if (matches.length > 0) {
                console.log(`First match sample:`, JSON.stringify(matches[0], null, 2).substring(0, 1000));
            }

            // Let's print the most recent matches in scanned_matches
            console.log('\nRecent matches in scanned_matches:');
            for (const m of matches) {
                console.log(`Match ID: ${m.matchId || m.id} | Timestamp: ${m.timestamp} | Date: ${m.date || m.datetime}`);
                // Print player names if they exist in this match
                const players = [];
                // Let's see what keys exist in match for players
                const keys = Object.keys(m);
                console.log(`  Keys in match doc: ${keys.join(', ')}`);
                // Let's check for players under the club id
                eaClubIds.forEach(cid => {
                    if (m.players && m.players[cid]) {
                        const pNames = Object.values(m.players[cid]).map(p => p.playername || p.playerName);
                        console.log(`  Club ${cid} Players: ${pNames.join(', ')}`);
                    }
                });
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
