// scratch/check_valdi_owner.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Searching for owners of Valdi_17 ---');
    const teamsWithValdi = await db.collection('fantasy_teams').find({
        players: { $regex: /^Valdi_17$/i }
    }).toArray();
    
    if (teamsWithValdi.length === 0) {
        console.log('No fantasy team owns Valdi_17!');
    } else {
        teamsWithValdi.forEach(t => {
            console.log(`Team: "${t.teamName}" (ID: ${t._id}) owns Valdi_17.`);
            console.log(`- Roster:`, t.players);
            console.log(`- Lineup:`, JSON.stringify(t.lineup, null, 2));
        });
    }

    console.log('\n--- Checking buyouts/transactions for Valdi_17 ---');
    const transactions = await db.collection('fantasy_buyouts').find({
        eaPlayerName: { $regex: /^Valdi_17$/i }
    }).toArray();
    console.log(`Found ${transactions.length} buyouts for Valdi_17:`);
    transactions.forEach(tx => {
        console.log(`- [${tx.timestamp}] Buyer: ${tx.buyerDiscordId} | Seller: ${tx.sellerDiscordId} | Price: ${tx.buyoutPrice}`);
    });

    console.log('\n--- Checking satiduxgaming details ---');
    const satidux = await db.collection('fantasy_teams').findOne({ teamName: "satiduxgaming" });
    if (satidux) {
        console.log(`satiduxgaming Roster:`, satidux.players);
        console.log(`satiduxgaming Lineup:`, JSON.stringify(satidux.lineup, null, 2));
    } else {
        console.log('satiduxgaming not found!');
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
