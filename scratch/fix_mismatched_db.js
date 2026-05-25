import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const playersToFix = ['ruben10_03', 'Dj_FiveDog', 'TSX-Juanri2', 'Aaron14', 'TaTo_'];

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const testDb = client.db('test');
        const playerColl = db.collection('player_profiles');
        
        console.log('Resolving active VPG contracts for mismatched players...');
        
        for (const username of playersToFix) {
            console.log(`\n- Checking ${username}...`);
            const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
            const res = await fetch(contractsUrl, { headers: HEADERS });
            if (!res.ok) {
                console.error(`Failed to fetch contracts for ${username}: ${res.status}`);
                continue;
            }
            
            const contracts = await res.json();
            if (!Array.isArray(contracts)) {
                console.error(`Invalid contract response for ${username}`);
                continue;
            }
            
            const activeContracts = contracts.filter(c => c.status === 'active');
            if (activeContracts.length === 0) {
                console.log(`No active contracts found on VPG for ${username}.`);
                continue;
            }
            
            console.log(`Active contracts for ${username}:`, activeContracts.map(c => `${c.team_name} (${c.team_slug})`));
            
            // Try to find the team in the database to map its division
            const firstActive = activeContracts[0];
            const dbTeam = await testDb.collection('teams').findOne({
                vpgTeamSlug: firstActive.team_slug.toLowerCase().trim()
            });
            
            if (dbTeam) {
                console.log(`Found team in DB: ${dbTeam.name} | Division: ${dbTeam.vpgLeagueSlug}`);
                const updateRes = await playerColl.updateOne(
                    { eaPlayerName: { $regex: new RegExp('^' + username + '$', 'i') } },
                    {
                        $set: {
                            vpgLeagueSlug: dbTeam.vpgLeagueSlug,
                            lastClub: dbTeam.name,
                            vpgTeamSlug: dbTeam.vpgTeamSlug
                        }
                    }
                );
                console.log(`Updated player profile:`, updateRes);
            } else {
                console.warn(`Could not find team slug "${firstActive.team_slug}" in database. Updating club name directly.`);
                const updateRes = await playerColl.updateOne(
                    { eaPlayerName: { $regex: new RegExp('^' + username + '$', 'i') } },
                    {
                        $set: {
                            lastClub: firstActive.team_name,
                            vpgTeamSlug: firstActive.team_slug
                        }
                    }
                );
                console.log(`Updated player club profile directly:`, updateRes);
            }
        }
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
