import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // Let's find all occurrences of `baseUrl}/` or matching endpoints.
        // Usually, in Angular, they call `this.http.get` or `this.http.post`
        const regex = /baseUrl\}([^`'\s]*)/g;
        let match;
        const matches = new Set();
        while ((match = regex.exec(text)) !== null) {
            matches.add(match[1]);
        }
        console.log("Endpoints found via baseUrl (first 40):");
        console.log(Array.from(matches).slice(0, 40));

        // Let's search for "roster" or "contracts" near "http" or "baseUrl"
        console.log("\nSearching for 'roster' endpoints:");
        const rosterRegex = /http\.[a-z]+\([^)]*roster[^)]*\)/gi;
        while ((match = rosterRegex.exec(text)) !== null) {
            console.log(match[0]);
        }
    } catch (e) {
        console.error(e);
    }
}

main();
