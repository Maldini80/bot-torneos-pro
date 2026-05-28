// scratch/check_raven_owner.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Searching for owners of ravenn8 ---');
    const teamsWithRaven = await db.collection('fantasy_teams').find({
        players: { $regex: /^ravenn8$/i }
    }).toArray();
    
    if (teamsWithRaven.length === 0) {
        console.log('No fantasy team owns ravenn8!');
    } else {
        teamsWithRaven.forEach(t => {
            console.log(`Team: "${t.teamName}" (ID: ${t._id}) owns ravenn8.`);
            console.log(`- Is ravenn8 in their lineup?`, JSON.stringify(t.lineup, null, 2));
        });
    }

    console.log('\n--- Checking buyouts/transactions for ravenn8 ---');
    const transactions = await db.collection('fantasy_buyouts').find({
        eaPlayerName: { $regex: /^ravenn8$/i }
    }).toArray();
    console.log(`Found ${transactions.length} buyouts for ravenn8:`);
    transactions.forEach(tx => {
        console.log(`- [${tx.timestamp}] Buyer: ${tx.buyerDiscordId} | Seller: ${tx.sellerDiscordId} | Price: ${tx.buyoutPrice}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
