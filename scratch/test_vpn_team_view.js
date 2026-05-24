import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('team/view', idx)) !== -1 && count < 20) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 100, idx + 100)}`);
            idx += 9;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
