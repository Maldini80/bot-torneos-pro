import { connectDb } from '../database.js';
import { runMarketAutomation } from '../src/utils/fantasyVpgSync.js';

async function main() {
    await connectDb();
    console.log("=== MANUAL MARKET AUTOMATION TRIGGER ===");
    try {
        await runMarketAutomation();
        console.log("=== MANUAL MARKET AUTOMATION COMPLETED ===");
    } catch (e) {
        console.error("=== MANUAL MARKET AUTOMATION FAILED ===");
        console.error(e);
    }
    process.exit(0);
}
main().catch(console.error);
