import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for 's0' (case-sensitive) in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('s0', idx)) !== -1 && count < 35) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 150)));
            idx += 2;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
