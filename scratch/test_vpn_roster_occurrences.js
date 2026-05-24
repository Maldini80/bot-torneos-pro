import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // Let's find occurrences of s0 or H0 or p0 or $0 in the script to find the effect.
        // We'll search for where they are referenced.
        // Note: the declaration was:
        // s0=(0,e.PH)("[Int] Load Team Roster",(0,e.Ky)())
        // And in Match 4:
        // H0=(0,e.PH)("Load Team Roster",(0,e.Ky)())
        
        // Let's search for the exact variable names or search for ".http" or the API call.
        // Let's search for `/roster` or `/contracts` or `/players` in the file.
        // Wait, does the API URL itself contain "roster" or "players"?
        // Let's search for `/roster` in the main bundle (without slash or with slash)
        console.log("Searching for 'roster' (case-insensitive) in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.toLowerCase().indexOf('roster', idx)) !== -1 && count < 30) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 100, idx + 100)}`);
            idx += 6;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
