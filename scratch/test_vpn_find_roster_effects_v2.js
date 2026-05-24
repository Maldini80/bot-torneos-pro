import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for imports of module 20529 (s(20529)) in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('s(20529)', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 800)));
            idx += 8;
            count++;
        }
        
        console.log("\nSearching for imports of module 97120 (s(97120)) in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('s(97120)', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 800)));
            idx += 8;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
