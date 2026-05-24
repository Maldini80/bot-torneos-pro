async function test() {
    const urls = [
        'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/admin_8e70f1bc-c2a8-4731-ab8a-33687bd39992/public',
        'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/00470ae4-73a3-4844-8f32-bb1c98c44a00/public'
    ];

    for (const url of urls) {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(url, "-> status:", res.status, "content-type:", res.headers.get('content-type'));
    }
}
test();
