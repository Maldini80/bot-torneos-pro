import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for 'KV' or 'p0' references in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('.KV', idx)) !== -1 && count < 25) {
            console.log(`Match ${count + 1} (.KV) at ${idx}:`);
            console.log(text.substring(idx - 250, idx + 250));
            idx += 3;
            count++;
        }
        
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('p0', idx)) !== -1 && count < 25) {
            // let's filter out non-variable contexts if possible
            const context = text.substring(idx - 150, idx + 150);
            if (context.includes('Success') || context.includes('service') || context.includes('http') || context.includes('get')) {
                console.log(`Match ${count + 1} (p0) at ${idx}:`);
                console.log(context);
                count++;
            }
            idx += 2;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
