import fetch from 'node-fetch';

async function main() {
    const compId = 52;
    const queries = [
        `?limit=200`,
        `?pageSize=200`,
        `?limit=100&page=1`,
        `?search=Oxygen`
    ];

    for (const q of queries) {
        const url = `https://www.virtualpronetwork.com/api/competitions/${compId}/teams${q}`;
        console.log(`Probing: ${url}`);
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`✅ Success for ${q}: count = ${data.count}, rows returned = ${data.rows ? data.rows.length : 'none'}`);
                if (data.rows && data.rows.length > 0) {
                    console.log("Sample team name:", data.rows[0].team ? data.rows[0].team.name : 'none');
                }
            } else {
                console.log(`❌ Failed for ${q}: status ${res.status}`);
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
