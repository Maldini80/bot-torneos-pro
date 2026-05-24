import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // Search for "/table" or "table"
        console.log("Searching for '/table' in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('/table', idx)) !== -1 && count < 10) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 60, idx + 60)}`);
            idx += 6;
            count++;
        }

        console.log("\nSearching for '/teams' in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('/teams', idx)) !== -1 && count < 15) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 60, idx + 60)}`);
            idx += 6;
            count++;
        }

        console.log("\nSearching for '/competitions' in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('/competitions', idx)) !== -1 && count < 10) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 60, idx + 60)}`);
            idx += 13;
            count++;
        }

        console.log("\nSearching for '/leagues' in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('/leagues', idx)) !== -1 && count < 10) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 60, idx + 60)}`);
            idx += 8;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
