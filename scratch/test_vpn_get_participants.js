import fetch from 'node-fetch';

async function main() {
    const urlVpn = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(urlVpn);
        const text = await res.text();
        
        let idx = text.indexOf('getParticipants');
        if (idx !== -1) {
            console.log("Found getParticipants! Surrounding 1000 characters:");
            console.log(text.substring(idx - 500, idx + 500));
        } else {
            console.log("getParticipants not found");
        }
    } catch (e) {
        console.error(e);
    }
}

main();
