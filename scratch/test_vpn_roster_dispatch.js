import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // We know from module 97120 that xX maps to s0.
        // Let's find all occurrences of 's0' (case-sensitive) or '.xX' or 'xX' in the bundle.
        // Let's print the module definitions that contain them!
        
        console.log("Searching for modules that import or use xX or s0:");
        const regex = /xX/g;
        let match;
        const indexes = [];
        while ((match = regex.exec(text)) !== null) {
            indexes.push(match.index);
        }
        
        for (const idx of indexes) {
            console.log(`\nIndex: ${idx}`);
            console.log(text.substring(Math.max(0, idx - 200), Math.min(text.length, idx + 200)));
        }
    } catch (e) {
        console.error(e);
    }
}

main();
