import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        console.log("Searching for URL patterns with teams/competitions/leagues in main.js:");
        
        const patterns = [
            'baseUrl}/teams',
            'baseUrl}/competitions',
            'baseUrl}/leagues',
            'baseUrl}/contracts',
            'baseUrl}/players',
            '/teams/',
            '/competitions/',
            '/leagues/',
            '/contracts/',
            '/players/'
        ];
        
        for (const pattern of patterns) {
            let idx = 0;
            let count = 0;
            console.log(`\n--- Pattern: ${pattern} ---`);
            while ((idx = text.indexOf(pattern, idx)) !== -1 && count < 10) {
                const before = text.substring(Math.max(0, idx - 150), idx);
                const after = text.substring(idx, Math.min(text.length, idx + 250));
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
