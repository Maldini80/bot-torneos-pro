import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        const terms = [
            '/roster', 'roster',
            '/contracts', 'contracts',
            '/players', 'players',
            '/members', 'members',
            '/users', 'users'
        ];

        for (const term of terms) {
            let idx = 0;
            let count = 0;
            console.log(`\nMatches for term: ${term}`);
            while ((idx = text.indexOf(term, idx)) !== -1 && count < 10) {
                // print surrounding 100 characters
                console.log(`- ${text.substring(idx - 60, idx + 60)}`);
                idx += term.length;
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
