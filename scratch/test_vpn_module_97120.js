import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        let idx = text.indexOf('97120:');
        if (idx !== -1) {
            console.log("Module 97120 definition:");
            console.log(text.substring(idx, idx + 1000));
        } else {
            console.log("Module 97120 not found.");
        }
    } catch (e) {
        console.error(e);
    }
}

main();
