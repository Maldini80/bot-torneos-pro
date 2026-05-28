// scratch/test_sync_doku.js
import { connectDb, getDb } from '../database.js';
import fetch from 'node-fetch';
import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

function getLeagueDivisionMultiplier(slug) {
    if (!slug) return 1.0;
    const s = slug.toLowerCase().trim();
    if (s === 'superliga-spain-a' || s === 'superliga-spain-b') {
        return 1.0; // 1ª División
    }
    if (s.includes('segunda')) {
        return 0.75; // 2ª División (-25%)
    }
    if (s.includes('tercera')) {
        return 0.55; // 3ª División (-45%)
    }
    if (s.includes('cuarta')) {
        return 0.40; // 4ª División (-60%)
    }
    if (s.includes('quinta')) {
        return 0.30; // 5ª División (-70%)
    }
    return 1.0; // default/fallback
}

async function main() {
    await connectDb();
    const db = getDb();
    const testDb = getDb('test');
    
    const activeLeagues = [
      'superliga-spain-a',
      'superliga-spain-b',
      'segunda-division-a-spain',
      'segunda-division-b-spain',
      'tercera-division-a-spain',
      'tercera-division-b-spain',
      'cuarta-division-a-spain',
      'cuarta-division-b-spain',
      'quinta-division-a-spain',
      'quinta-division-b-spain',
      'quinta-division-c',
      'quinta-division-d'
    ];
    
    const dbTeams = await testDb.collection('teams').find({ vpgLeagueSlug: { $in: activeLeagues } }).toArray();
    console.log(`Loaded ${dbTeams.length} DB teams.`);
    
    // Check if "PRO ATHLETIC" or "LTK ESPORTS" is in dbTeams
    const ltkDbTeam = dbTeams.find(t => t.vpgTeamSlug === 'ltk-esports' || t.name?.toLowerCase().includes('ltk'));
    const proAthleticDbTeam = dbTeams.find(t => t.vpgTeamSlug === 'pro-athletic-spain' || t.name?.toLowerCase().includes('pro athletic'));
    const ceutaDbTeam = dbTeams.find(t => t.vpgTeamSlug === 'ceuta-guardians' || t.name?.toLowerCase().includes('ceuta'));
    
    console.log(`LTK DbTeam in DB:`, ltkDbTeam ? `${ltkDbTeam.name} (${ltkDbTeam.vpgLeagueSlug})` : 'Not found');
    console.log(`PRO ATHLETIC DbTeam in DB:`, proAthleticDbTeam ? `${proAthleticDbTeam.name} (${proAthleticDbTeam.vpgLeagueSlug})` : 'Not found');
    console.log(`CEUTA DbTeam in DB:`, ceutaDbTeam ? `${ceutaDbTeam.name} (${ceutaDbTeam.vpgLeagueSlug})` : 'Not found');

    const existingPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: "xDoku_11" });
    console.log(`\nExisting Player profile in DB:`);
    console.log(`- eaPlayerName: ${existingPlayer.eaPlayerName}`);
    console.log(`- vpgLeagueSlug: ${existingPlayer.vpgLeagueSlug}`);
    console.log(`- vpgTeamSlug: ${existingPlayer.vpgTeamSlug}`);
    console.log(`- stats.vpgPoints: ${existingPlayer.stats?.vpgPoints}`);
    console.log(`- stats.matchesPlayed: ${existingPlayer.stats?.matchesPlayed}`);
    console.log(`- stats.vpgLastRaw:`, existingPlayer.stats?.vpgLastRaw);

    // Simulate sync step for "superliga-spain-a"
    console.log(`\n--- Simulating sync for "superliga-spain-a" ---`);
    const pData_A = {
        lastClub: 'LTK ESPORTS',
        lastActive: new Date(),
        lastPosition: 'CARR',
        vpgLeagueSlug: 'superliga-spain-a',
        vpgTeamSlug: 'ltk-esports',
        stats: {
            matchesPlayed: 10,
            goals: 3,
            assists: 1,
            vpgPoints: 111.2
        }
    };
    
    let updateData = { ...pData_A };
    let shouldSkip = false;
    
    if (existingPlayer.vpgLeagueSlug && existingPlayer.vpgLeagueSlug !== 'superliga-spain-a') {
        console.log(`[Conflict detected] Existing league: ${existingPlayer.vpgLeagueSlug}, current crawl: superliga-spain-a`);
        const username = 'xDoku_11';
        const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
        const contractRes = await fetch(contractsUrl, { headers: HEADERS });
        
        if (contractRes.ok) {
            const contracts = await contractRes.json();
            const activeContracts = contracts.filter(c => c.status === 'active');
            console.log(`Active contracts:`, activeContracts.map(c => `${c.team_name} (${c.team_slug})`));
            
            if (activeContracts.length > 0) {
                const matchesActiveContract = activeContracts.some(c => 
                    String(c.team_slug || '').toLowerCase().trim() === String(pData_A.vpgTeamSlug || '').toLowerCase().trim()
                );
                console.log(`Matches active contract (ltk-esports):`, matchesActiveContract);
                
                if (!matchesActiveContract) {
                    let contractTeam = null;
                    for (const contract of activeContracts) {
                        const cSlug = String(contract.team_slug || '').toLowerCase().trim();
                        const cName = String(contract.team_name || '').toLowerCase().trim();
                        const found = dbTeams.find(t => 
                            String(t.vpgTeamSlug || '').toLowerCase().trim() === cSlug ||
                            String(t.name || '').toLowerCase().trim() === cName
                        );
                        if (found) {
                            contractTeam = found;
                            break;
                        }
                    }
                    
                    if (contractTeam) {
                        console.log(`[Re-mapping] Mapped to active contract team: ${contractTeam.name} (${contractTeam.vpgLeagueSlug})`);
                        updateData.lastClub = contractTeam.name;
                        updateData.vpgLeagueSlug = contractTeam.vpgLeagueSlug;
                        updateData.vpgTeamSlug = contractTeam.vpgTeamSlug;
                        shouldSkip = false;
                    } else {
                        console.log(`[Skipping] Active contract in another non-mapped club.`);
                        shouldSkip = true;
                    }
                }
            } else {
                console.log(`No active contracts. Comparing division multipliers...`);
                if (getLeagueDivisionMultiplier(existingPlayer.vpgLeagueSlug) > getLeagueDivisionMultiplier('superliga-spain-a')) {
                    shouldSkip = true;
                }
            }
        } else {
            console.log(`Contracts API failed. Comparing division multipliers...`);
            if (getLeagueDivisionMultiplier(existingPlayer.vpgLeagueSlug) > getLeagueDivisionMultiplier('superliga-spain-a')) {
                shouldSkip = true;
            }
        }
    }
    
    console.log(`shouldSkip for "superliga-spain-a": ${shouldSkip}`);
    console.log(`Final updateData for "superliga-spain-a":`, JSON.stringify(updateData, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
