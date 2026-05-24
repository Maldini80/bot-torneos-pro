import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // Find urls matching `api/teams/` or similar in the text
        const regexes = [
            /api\/teams\/[a-zA-Z0-9_\-\/]+/g,
            /api\/competitions\/[a-zA-Z0-9_\-\/]+/g,
            /api\/leagues\/[a-zA-Z0-9_\-\/]+/g,
            /api\/users\/[a-zA-Z0-9_\-\/]+/g,
            /api\/players\/[a-zA-Z0-9_\-\/]+/g
        ];

        for (const regex of regexes) {
            console.log(`\nMatches for regex: ${regex}`);
            let match;
            const matches = new Set();
            while ((match = regex.exec(text)) !== null) {
                matches.add(match[0]);
                if (matches.size >= 15) break;
            }
            console.log(Array.from(matches));
        }

        // Let's search for "team/" or "/team" or "roster" or "players" near "api"
        console.log("\nSearching for 'roster' occurrences in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('roster', idx)) !== -1 && count < 20) {
            console.log(`Roster Match ${count + 1}: ${text.substring(idx - 60, idx + 60)}`);
            idx += 6;
            count++;
        }

        console.log("\nSearching for 'players' occurrences in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('players', idx)) !== -1 && count < 15) {
            console.log(`Players Match ${count + 1}: ${text.substring(idx - 60, idx + 60)}`);
            idx += 7;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
