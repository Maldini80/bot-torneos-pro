import fetch from 'node-fetch';

async function main() {
    const seasonId = 6377;
    const url = `https://www.virtualpronetwork.com/api/leagues/2212/table?season=${seasonId}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const items = Array.isArray(data) ? data : Object.values(data);
        console.log("Item keys:", Object.keys(items[0]));
        // Let's print everything in the first item except the matchesDictionary (which is huge)
        const itemCopy = { ...items[0] };
        delete itemCopy.matchesDictionary;
        console.log("First item (without matchesDictionary):", JSON.stringify(itemCopy, null, 2));
    } catch (e) {
        console.error(e);
    }
}

main();
