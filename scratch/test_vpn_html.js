import fetch from 'node-fetch';

async function main() {
    const urls = [
        'https://www.virtualpronetwork.com/team/oxygen-levante',
        'https://www.virtualpronetwork.com/club/oxygen-levante',
        'https://www.virtualpronetwork.com/teams/oxygen-levante',
        'https://www.virtualpronetwork.com/oxygen-levante'
    ];

    for (const url of urls) {
        console.log(`Fetching: ${url}`);
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const text = await res.text();
                console.log(`Length: ${text.length}`);
                console.log(`Sample: ${text.substring(0, 500)}`);
                // Let's search if the HTML contains player names or something similar
                return;
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
