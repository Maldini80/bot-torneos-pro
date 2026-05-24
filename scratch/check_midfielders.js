import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function main() {
    const league = "superliga-spain-a";
    
    // Fetch cdm
    const cdmRes = await fetch(`https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=top_cdm&type=all&limit=100`, { headers: HEADERS });
    const cdmData = await cdmRes.json();
    const cdmPlayers = cdmData.data || [];
    
    // Fetch cam
    const camRes = await fetch(`https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=top_cam&type=all&limit=100`, { headers: HEADERS });
    const camData = await camRes.json();
    const camPlayers = camData.data || [];
    
    console.log(`Fetched ${cdmPlayers.length} CDMs and ${camPlayers.length} CAMs.`);
    
    // Find duplicates
    let matchCount = 0;
    for (const cdm of cdmPlayers) {
        const cam = camPlayers.find(p => p.username && p.username.toLowerCase() === cdm.username.toLowerCase());
        if (cam) {
            matchCount++;
            if (matchCount <= 5) {
                console.log(`\nPlayer: ${cdm.username}`);
                console.log(`  CDM stats: matches: ${cdm.matches_played}, points: ${cdm.points}, goals: ${cdm.goals}, assists: ${cdm.assists}`);
                console.log(`  CAM stats: matches: ${cam.matches_played}, points: ${cam.points}, goals: ${cam.goals}, assists: ${cam.assists}`);
                const isIdentical = cdm.matches_played === cam.matches_played && cdm.points === cam.points && cdm.goals === cam.goals && cdm.assists === cam.assists;
                console.log(`  Are stats identical? ${isIdentical}`);
            }
        }
    }
    
    console.log(`\nTotal duplicate players found in both CDM and CAM: ${matchCount}`);
}

main().catch(console.error);
