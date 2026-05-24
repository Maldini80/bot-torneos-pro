import fetch from 'node-fetch';

async function main() {
    const seasonId = 6377;
    const url = `https://www.virtualpronetwork.com/api/leagues/2212/table?season=${seasonId}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const items = Array.isArray(data) ? data : Object.values(data);
        const first = items[0];
        console.log("Keys of first item:", Object.keys(first));
        console.log("gp:", first.gp);
        console.log("gw:", first.gw);
        console.log("gt:", first.gt);
        console.log("gl:", first.gl);
        console.log("gf:", first.gf);
        console.log("gc:", first.gc);
        console.log("gd:", first.gd);
        console.log("pts:", first.pts);
        console.log("tid:", first.tid);
        console.log("pos:", first.pos);
        console.log("team name:", first.team.name);
        console.log("Type of first.matches:", typeof first.matches, Array.isArray(first.matches));
        if (Array.isArray(first.matches)) {
            console.log("Matches length:", first.matches.length);
            if (first.matches.length > 0) {
                console.log("First match object keys:", Object.keys(first.matches[0]));
                console.log("First match object sample:", JSON.stringify(first.matches[0], null, 2));
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
