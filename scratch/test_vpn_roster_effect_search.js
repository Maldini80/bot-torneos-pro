import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for 'xX' in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('xX', idx)) !== -1 && count < 25) {
            console.log(`Match ${count + 1} at ${idx}:`);
            console.log(text.substring(idx - 150, idx + 150));
            idx += 2;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
