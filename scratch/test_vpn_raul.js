import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/users/204146");
        const data = await res.json();
        console.log("raulpc93 status:", data.user.status);
    } catch (e) {
        console.error(e);
    }
}

main();
