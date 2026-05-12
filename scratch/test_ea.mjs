import fetch from 'node-fetch';

const EA_HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 
    'Accept': 'application/json', 
    'Origin': 'https://www.ea.com', 
    'Referer': 'https://www.ea.com/' 
};

async function testMembers() {
    console.log("--- TEST MEMBERS ---");
    const urls = [
        "https://proclubs.ea.com/api/fc/members/stats?clubIds=12339&platform=common-gen5",
        "https://proclubs.ea.com/api/fc/members/stats?clubIds=12339&platform=ps5",
        "https://proclubs.ea.com/api/fc/members/career/stats?clubIds=12339&platform=common-gen5" // maybe career stats?
    ];

    for (const url of urls) {
        console.log(`Testing: ${url}`);
        const res = await fetch(url, { headers: EA_HEADERS });
        console.log(`Status: ${res.status}`);
        try {
            const text = await res.text();
            console.log(`Response: ${text.substring(0, 200)}`);
        } catch(e) {
            console.log("No text body");
        }
    }
}

async function testMatch() {
    console.log("\n--- TEST VPROATTR ---");
    const url = "https://proclubs.ea.com/api/fc/clubs/matches?clubIds=12339&platform=common-gen5&matchType=friendlyMatch";
    const res = await fetch(url, { headers: EA_HEADERS });
    if (res.ok) {
        let data = await res.json();
        if (!Array.isArray(data)) data = Object.values(data || {});
        if (data.length > 0) {
            const m = data[0];
            if (m.players) {
                const cid = Object.keys(m.players)[0];
                if (cid) {
                    const pid = Object.keys(m.players[cid])[0];
                    if (pid) {
                        const player = m.players[cid][pid];
                        console.log(`Player Name: ${player.playername}`);
                        console.log(`VPROATTR: ${player.vproattr}`);
                        console.log(`HACKREASON: ${player.vprohackreason}`);
                    }
                }
            }
        } else {
            console.log("No matches found");
        }
    } else {
        console.log(`Failed to fetch match: ${res.status}`);
    }
}

async function main() {
    await testMembers();
    await testMatch();
}

main();
