// scratch/get_club_info.js
import 'dotenv/config';

const EA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.ea.com/"
};

async function main() {
    const platform = 'common-gen5';
    const clubId = '8701';
    const url = `https://proclubs.ea.com/api/fc/clubs/info?clubIds=${clubId}&platform=${platform}`;
    
    console.log(`[EA Info] Querying: ${url}`);
    
    try {
        const res = await fetch(url, { headers: EA_HEADERS });
        if (!res.ok) {
            console.error(`Error: ${res.status} ${res.statusText}`);
            process.exit(1);
        }
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
    
    process.exit(0);
}

main();
