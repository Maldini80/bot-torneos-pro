import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/apps/es/team/view/24840");
        const text = await res.text();
        // find all src attributes in script tags
        const regex = /<script[^>]*src="([^"]*)"/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            console.log("Script src:", match[1]);
        }
    } catch (e) {
        console.error(e);
    }
}

main();
