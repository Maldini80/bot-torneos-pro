import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for '.pU' occurrences in VPN bundle:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('.pU', idx)) !== -1) {
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
