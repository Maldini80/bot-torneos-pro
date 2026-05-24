import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for URL patterns in main.js:");
        
        const patterns = [
            'contracts', 'roster', 'players', 'members', 'signings', 'transfers'
        ];
        
        for (const pattern of patterns) {
            let idx = 0;
            let count = 0;
            console.log(`\n--- Pattern: ${pattern} ---`);
            while ((idx = text.indexOf(pattern, idx)) !== -1 && count < 25) {
                // If it looks like a URL/endpoint (e.g. preceded by slash or in a string)
                const before = text.substring(Math.max(0, idx - 60), idx);
                const after = text.substring(idx, Math.min(text.length, idx + 100));
                console.log(`Match ${count + 1}: ...${before}[${pattern}]${after}...`);
                idx += pattern.length;
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
