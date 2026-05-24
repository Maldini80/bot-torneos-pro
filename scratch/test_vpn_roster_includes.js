import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    const queries = [
        `?include=users`,
        `?include=players`,
        `?include=contracts`,
        `?include=members`,
        `?include=roster`,
        `?include=all`,
        `?with=users`,
        `?with=players`,
        `?with=roster`
    ];

    for (const q of queries) {
        const url = `https://www.virtualpronetwork.com/api/teams/${teamId}${q}`;
        console.log(`Probing: ${url}`);
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`🎉 SUCCESS: ${url}`);
                console.log("Keys returned:", Object.keys(data));
                // Check if any key contains array
                for (const [key, value] of Object.entries(data)) {
                    if (Array.isArray(value)) {
                        console.log(`-> Found Array: ${key} (length ${value.length})`);
                        if (value.length > 0) {
                            console.log("Sample array item:", JSON.stringify(value[0]).substring(0, 300));
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
