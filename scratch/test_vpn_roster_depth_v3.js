import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for the number '20529' in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('20529', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} for '20529' at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 200)));
            idx += 5;
            count++;
        }
        
        console.log("\nSearching for the number '97120' in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('97120', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} for '97120' at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 200)));
            idx += 5;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
