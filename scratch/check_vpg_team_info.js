import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const teamSlug = "JAM-ES"; // JAM ESPORTS team_slug
    const teamUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/`;
    const matchesUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/matches/`;
    const rosterUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/roster/`;
    
    console.log(`Querying VPG API for Team: ${teamSlug}...`);
    try {
        const teamRes = await fetch(teamUrl, { headers: HEADERS });
        if (teamRes.ok) {
            const teamData = await teamRes.json();
            console.log('VPG Team Data:', JSON.stringify(teamData, null, 2));
        } else {
            console.log(`Failed to fetch team: HTTP ${teamRes.status}`);
        }
        
        console.log(`\nQuerying VPG Team Matches...`);
        const matchesRes = await fetch(matchesUrl, { headers: HEADERS });
        if (matchesRes.ok) {
            const matches = await matchesRes.json();
            console.log(`Total VPG Matches found: ${matches.length || (matches.data && matches.data.length)}`);
            // Show newest 5 matches
            const matchArr = Array.isArray(matches) ? matches : (matches.data || []);
            const sample = matchArr.slice(0, 5);
            console.log('Sample Matches:', JSON.stringify(sample, null, 2));
        } else {
            console.log(`Failed to fetch team matches: HTTP ${matchesRes.status}`);
        }
        
    } catch (e) {
        console.error(e);
    }
}
run();
