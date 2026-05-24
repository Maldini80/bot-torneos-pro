import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/competitions/52/teams");
        const data = await res.json();
        console.log("Total count:", data.count);
        if (data.rows && data.rows.length > 0) {
            console.log("Full first row keys:", Object.keys(data.rows[0]));
            console.log("Full first row detail:", JSON.stringify(data.rows[0], null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

main();
