import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('loadingTeam:', idx)) !== -1 && count < 10) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 300, idx + 300)}`);
            idx += 12;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
