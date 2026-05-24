import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for surrounding context of 'Load Team Roster' occurrences:");
        const actionNames = ['Load Team Roster', 'Load Team Roster Success', 'Load Team Roster Error'];
        for (const name of actionNames) {
            let idx = 0;
            let count = 0;
            while ((idx = text.indexOf(name, idx)) !== -1) {
                console.log(`\n--- Match ${count + 1} for '${name}' at ${idx} ---`);
                // Let's search for how it is defined or used in the module
                // A module starts with something like 12345:(...) or similar.
                // Let's find the nearest module ID before the match.
                let moduleStart = text.lastIndexOf('},', idx);
                if (moduleStart === -1) moduleStart = 0;
                console.log(`Module context (starts near ${moduleStart}):`);
                console.log(text.substring(moduleStart, Math.min(text.length, idx + 1000)));
                idx += name.length;
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
