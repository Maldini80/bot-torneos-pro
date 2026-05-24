import fetch from 'node-fetch';

const LEAGUES = [
    { name: '1ª DIVISIÓN', id: 2212, season: 6377 },
    { name: '2ª DIVISIÓN', id: 2213, season: 6378 },
    { name: '3ª DIVISIÓN A', id: 2214, season: 6379 },
    { name: '3ª DIVISIÓN B', id: 2215, season: 6380 },
    { name: 'REGIONAL A', id: 2216, season: 6381 },
    { name: 'REGIONAL B', id: 2217, season: 6382 }
];

async function main() {
    for (const l of LEAGUES) {
        const url = `https://www.virtualpronetwork.com/api/leagues/${l.id}/table?season=${l.season}`;
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const items = Array.isArray(data) ? data : Object.values(data);
                console.log(`✅ ${l.name} (ID: ${l.id}, Season: ${l.season}) -> Table rows: ${items.length}`);
            } else {
                console.log(`❌ ${l.name} (ID: ${l.id}, Season: ${l.season}) -> Failed with status ${res.status}`);
            }
        } catch (e) {
            console.log(`❌ ${l.name} (ID: ${l.id}, Season: ${l.season}) -> Error: ${e.message}`);
        }
    }
}

main();
