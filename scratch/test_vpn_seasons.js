import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/competitions/52");
        const data = await res.json();
        
        console.log("Competition keys:", Object.keys(data));
        
        // Let's search for "season" or similar fields inside the leagues or other objects
        console.log("Looking for season in data...");
        // Let's inspect leagues_groups_teams
        if (data.leagues_groups_teams) {
            console.log("leagues_groups_teams sample:", JSON.stringify(data.leagues_groups_teams[0]).substring(0, 1000));
        }
        
        // Let's find any field that has a season ID or current season
        for (const [key, value] of Object.entries(data)) {
            if (key.toLowerCase().includes('season')) {
                console.log(`Found season key: ${key}`, JSON.stringify(value).substring(0, 500));
            }
        }
        
        // Let's query one league table with a season. Wait, does the competition have a season field?
        // Let's print leagues_groups_teams length and active leagues
        console.log("Active leagues:", data.leagues.map(l => ({ id: l.id, name: l.name })));
        
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
