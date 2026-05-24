import { chromium } from 'playwright';

async function main() {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Intercept requests
    page.on('request', request => {
        const url = request.url();
        if (url.includes('/api/')) {
            console.log(`[API REQUEST] ${request.method()} ${url}`);
        }
    });

    page.on('response', async response => {
        const url = response.url();
        if (url.includes('/api/')) {
            console.log(`[API RESPONSE] ${response.status()} ${url}`);
            try {
                const text = await response.text();
                console.log(`-> Response body length: ${text.length}`);
                if (url.includes('roster') || url.includes('player') || url.includes('member') || url.includes('contract') || url.includes('users')) {
                    console.log(`-> Response sample: ${text.substring(0, 1000)}`);
                }
            } catch (e) {
                // ignore
            }
        }
    });

    const targetUrl = 'https://www.virtualpronetwork.com/apps/es/team/view/24840';
    console.log(`Navigating to ${targetUrl}...`);
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        console.log("Navigation completed. Waiting 5 more seconds...");
        await page.waitForTimeout(5000);
    } catch (e) {
        console.error("Navigation failed:", e.message);
    } finally {
        await browser.close();
        console.log("Browser closed.");
    }
}

main();
