import axios from 'axios';

async function run() {
    try {
        const username = 'ublaya777';
        const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/`;
        const res = await axios.get(url);
        console.log('=== VPG USER PROFILE ===');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
run();
