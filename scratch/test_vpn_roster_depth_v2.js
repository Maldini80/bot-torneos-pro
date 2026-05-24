import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for 'roster' service methods:");
        const terms = ['roster', 'Roster', 'contract', 'Contract', 'member', 'Member'];
        for (const term of terms) {
            let idx = 0;
            let count = 0;
            while ((idx = text.indexOf(term, idx)) !== -1 && count < 5) {
                // Find surround code to see if there is an api endpoint or method definition
                console.log(`\n--- Match for '${term}' at index ${idx} ---`);
                console.log(text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 150)));
                idx += term.length;
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
