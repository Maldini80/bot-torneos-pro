import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // Let's search for "Load Team Roster Success" or "[Int] Load Team Roster Success"
        // and find where they are referenced or dispatched in effects.
        // Usually, it's something like:
        // ofType(someAction), switchMap(action => this.someService.getSomething(action.id)... map(result => successAction({result})))
        // Let's search for `p0(` or `$0(` in the bundle.
        
        console.log("Searching for 'p0(' in main.js:");
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf('p0(', idx)) !== -1 && count < 20) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 150, idx + 150)}`);
            idx += 3;
            count++;
        }

        console.log("\nSearching for '$0(' in main.js:");
        idx = 0;
        count = 0;
        while ((idx = text.indexOf('$0(', idx)) !== -1 && count < 20) {
            console.log(`Match ${count + 1}: ${text.substring(idx - 150, idx + 150)}`);
            idx += 3;
            count++;
        }
    } catch (e) {
        console.error(e);
    }
}

main();
