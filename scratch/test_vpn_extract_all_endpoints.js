import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Extracting all API endpoints constructed in main.js:");
        
        // Let's use regex to find all matches of `${...baseUrl}/[a-zA-Z0-9_/]+` or similar
        const regexes = [
            /baseUrl}\/([a-zA-Z0-9_\-\/]+)/g,
            /baseUrl}\/([a-zA-Z0-9_\-\/]+)\$\{/g,
            /url\s*=\s*`\$\{[a-zA-Z0-9_\.]+baseUrl\}\/([a-zA-Z0-9_\-\/]+)/g
        ];
        
        const endpoints = new Set();
        for (const regex of regexes) {
            let match;
            while ((match = regex.exec(text)) !== null) {
                endpoints.add(match[1]);
            }
        }
        
        console.log(`Found ${endpoints.size} distinct endpoints:`);
        const sorted = Array.from(endpoints).sort();
        sorted.forEach(e => console.log(`- ${e}`));
        
    } catch (e) {
        console.error(e);
    }
}

main();
