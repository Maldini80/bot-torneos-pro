import fetch from 'node-fetch'; // standard fetch works in node 18

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/competitions/52");
        const data = await res.json();
        
        console.log("Leagues list:");
        data.leagues.forEach(l => {
            console.log(`- League: ${l.name} (ID: ${l.id}, division: ${l.division})`);
        });

        // Let's test fetching a league table.
        // Wait, how do we know the season ID?
        // Let's fetch https://www.virtualpronetwork.com/api/leagues/2212/table without a season to see if it defaults or what it returns.
        console.log("\nFetching 1ª División table (ID 2212) without season...");
        const tableRes = await fetch("https://www.virtualpronetwork.com/api/leagues/2212/table");
        if (tableRes.ok) {
            const tableData = await tableRes.json();
            console.log("Table data loaded successfully!");
            console.log("Table keys:", Object.keys(tableData));
            if (tableData.table) {
                console.log(`Table rows count: ${tableData.table.length}`);
                console.log("First row:", JSON.stringify(tableData.table[0], null, 2));
            }
            if (tableData.matchesDictionary) {
                console.log(`Matches dictionary count: ${Object.keys(tableData.matchesDictionary).length}`);
                // print a small sample
                const firstKey = Object.keys(tableData.matchesDictionary)[0];
                console.log(`Sample match dictionary entry for key '${firstKey}':`, JSON.stringify(tableData.matchesDictionary[firstKey].slice(0, 1), null, 2));
            }
            if (tableData.season) {
                console.log("Season details:", JSON.stringify(tableData.season, null, 2));
            }
        } else {
            console.error("Failed to fetch table:", tableRes.status, tableRes.statusText);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
