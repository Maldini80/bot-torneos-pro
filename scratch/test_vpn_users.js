import fetch from 'node-fetch';

async function main() {
    const urls = [
        'https://www.virtualpronetwork.com/api/users/281409',
        'https://www.virtualpronetwork.com/api/users/204146',
        'https://www.virtualpronetwork.com/api/users?search=xAubameyang10_',
        'https://www.virtualpronetwork.com/api/players/204146',
        'https://www.virtualpronetwork.com/api/players?search=xAubameyang10_'
    ];

    for (const url of urls) {
        console.log(`Probing: ${url}`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                console.log("Success! Keys:", Object.keys(data));
                console.log("Sample:", JSON.stringify(data).substring(0, 500));
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
