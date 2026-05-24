import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for references to actions in effects or services:");
        
        // Let's find all occurrences of `.xX` (which is exported as xX in module 97120)
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('.xX', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} for .xX at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 400), Math.min(text.length, idx + 400)));
            idx += 3;
            count++;
        }

        // Let's also search for `.KV` (Success action)
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('.KV', idx)) !== -1) {
            console.log(`\n--- Match ${count + 1} for .KV at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 400), Math.min(text.length, idx + 400)));
            idx += 3;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
