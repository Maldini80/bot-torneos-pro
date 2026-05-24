import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for HTTP GET calls in main.js:");
        
        // Find all "http.get" or ".http.get(" occurrences
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('.http.get(', idx)) !== -1 && count < 40) {
            console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
            console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 200)));
            idx += 10;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
