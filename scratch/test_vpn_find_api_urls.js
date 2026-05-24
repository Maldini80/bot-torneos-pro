import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for API endpoint constructions in main.js:");
        
        // Find all templates like ${r.N.baseUrl}/...
        // Let's search for baseUrl}/ or baseUrl}/account or similar
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('baseUrl}/', idx)) !== -1 && count < 60) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 200)));
            idx += 9;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
