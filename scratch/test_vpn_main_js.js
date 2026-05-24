import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/apps/es/main.033f51c4195fdcb4.js'; // Wait, base href is /web/, so it might be /web/main.033f51c4195fdcb4.js
    const urls = [
        'https://www.virtualpronetwork.com/apps/es/main.033f51c4195fdcb4.js',
        'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js',
        'https://www.virtualpronetwork.com/main.033f51c4195fdcb4.js'
    ];

    for (const u of urls) {
        console.log(`Downloading: ${u}`);
        try {
            const res = await fetch(u);
            if (res.ok) {
                const text = await res.text();
                console.log(`Downloaded successfully! Size: ${text.length} bytes`);
                // Let's search for "api/" or "table"
                const queries = [
                    /api\/teams\/[a-zA-Z0-9_\-${}]*/g,
                    /api\/[a-zA-Z0-9_\-\/]+/g,
                    /api\//g
                ];
                // Let's search for occurrences of "api/" and print surrounding 100 characters
                let index = 0;
                let count = 0;
                while ((index = text.indexOf('api/', index)) !== -1 && count < 20) {
                    console.log(`Match ${count + 1}: ${text.substring(index - 50, index + 100)}`);
                    index += 4;
                    count++;
                }
                break;
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
