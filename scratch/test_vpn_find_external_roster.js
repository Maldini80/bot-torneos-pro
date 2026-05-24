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
        
        console.log("\nSearching for '.on' occurrences in VPN bundle:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('.on', idx)) !== -1) {
            // filter to make sure it's not a generic word like ".on(" or ".only"
            const context = text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 150));
            if (context.includes('on(') || context.includes('on,') || context.includes('on}') || context.includes('.on')) {
                console.log(`\n--- Match ${count + 1} at index ${idx} ---`);
                console.log(context);
                count++;
            }
            idx += 3;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
