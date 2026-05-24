import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    try {
        const res = await fetch(`https://www.virtualpronetwork.com/api/teams/${teamId}`);
        if (res.ok) {
            const data = await res.json();
            console.log("Team data keys:", Object.keys(data));
            console.log("Team name:", data.name);
            console.log("Sample values for some keys:");
            for (const key of Object.keys(data)) {
                const val = data[key];
                if (val && typeof val === 'object') {
                    console.log(`- ${key}: object/array, keys:`, Object.keys(val), "length/size if array:", Array.isArray(val) ? val.length : 'N/A');
                } else {
                    console.log(`- ${key}: ${typeof val} = ${val}`);
                }
            }
        } else {
            console.log("Failed to fetch team:", res.status);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
