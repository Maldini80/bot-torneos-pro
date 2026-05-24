import fetch from 'node-fetch';

async function main() {
    const urls = [
        'https://www.virtualpronetwork.com/apps/es/team/view/24840',
        'https://www.virtualpronetwork.com/apps/global/team/view/24840',
        'https://www.virtualpronetwork.com/apps/es/team/view/29382',
        'https://www.virtualpronetwork.com/apps/global/team/view/29382'
    ];

    for (const url of urls) {
        console.log(`\nFetching: ${url}`);
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const text = await res.text();
                console.log(`Length: ${text.length}`);
                // Check if it contains some typical words
                console.log(`Contains 'Plantilla': ${text.includes('Plantilla') || text.includes('plantilla')}`);
                console.log(`Contains 'Roster': ${text.includes('Roster') || text.includes('roster')}`);
                console.log(`Contains 'Jugadores': ${text.includes('Jugadores') || text.includes('jugadores')}`);
                console.log(`Sample: ${text.substring(0, 1000)}`);
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
