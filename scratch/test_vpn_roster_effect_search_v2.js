import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for references to Roster action names in main.js:");
        const actionNames = ['[Int] Load Team Roster', 'Load Team Roster'];
        for (const action of actionNames) {
            let idx = 0;
            let count = 0;
            while ((idx = text.indexOf(action, idx)) !== -1) {
                console.log(`\n--- Match for '${action}' at index ${idx} ---`);
                console.log(text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 800)));
                idx += action.length;
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
