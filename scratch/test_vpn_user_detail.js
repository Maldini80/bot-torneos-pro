import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/users/281409");
        const data = await res.json();
        console.log("Full Keys:", Object.keys(data));
        console.log("user keys:", Object.keys(data.user));
        console.log("user detail:", JSON.stringify(data.user, null, 2));
    } catch (e) {
        console.error(e);
    }
}

main();
