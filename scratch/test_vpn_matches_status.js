import fetch from 'node-fetch';

async function main() {
    try {
        const seasonId = 6381;
        const leagueId = 2216;
        const url = `https://www.virtualpronetwork.com/api/leagues/${leagueId}/table?season=${seasonId}`;
        const res = await fetch(url);
        const data = await res.json();
        const first = data[0];
        
        console.log("Analyzing matches for team:", first.team.name);
        const playedMatches = [];
        const scheduledMatches = [];
        
        first.matches.forEach(m => {
            if (m.gteam1 !== null && m.gteam2 !== null) {
                playedMatches.push(m);
            } else {
                scheduledMatches.push(m);
            }
        });
        
        console.log(`Total matches: ${first.matches.length}`);
        console.log(`Played matches identified: ${playedMatches.length}`);
        console.log(`Scheduled matches identified: ${scheduledMatches.length}`);
        
        if (playedMatches.length > 0) {
            console.log("\nSample played match scores:", playedMatches[0].gteam1, "-", playedMatches[0].gteam2);
        }
        if (scheduledMatches.length > 0) {
            console.log("\nSample scheduled match:", JSON.stringify(scheduledMatches[0], null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

main();
