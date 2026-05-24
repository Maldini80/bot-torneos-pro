const url = 'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/avatar_b3c17463-0b10-4ed8-9c09-669372d25b44/smThumb';

async function main() {
    console.log("Testing URL:", url);
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log("Status:", res.status);
        console.log("Headers:", Object.fromEntries(res.headers.entries()));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

main();
