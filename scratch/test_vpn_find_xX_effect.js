import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualprogaming.com/web/main.033f51c4195fdcb4.js'; // Wait, let's verify if the url is virtualpronetwork or virtualprogaming!
    // Ah! In our earlier scripts we used https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js !
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for '.xX' occurrences in VPN bundle:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('.xX', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 400), Math.min(text.length, idx + 400)));
            idx += 3;
            count++;
        }
        
        console.log("\nSearching for '.KV' occurrences in VPN bundle:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('.KV', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 400), Math.min(text.length, idx + 400)));
            idx += 3;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
