import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        let idx = 0;
        let count = 0;
        // Search for "Load Team Roster Success" (case-sensitive)
        while ((idx = text.indexOf('Load Team Roster Success', idx)) !== -1 && count < 5) {
            console.log(`Match ${count + 1}:`);
            console.log(text.substring(idx - 100, idx + 800));
            idx += 24;
            count++;
        }

        console.log("\nSearching for '[Int] Load Team Roster Success':");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('[Int] Load Team Roster Success', idx)) !== -1 && count < 5) {
            console.log(`Match ${count + 1}:`);
            console.log(text.substring(idx - 100, idx + 800));
            idx += 30;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
