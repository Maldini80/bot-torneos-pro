import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /humanes/i
    });
    
    console.log(`Starting budget check for league: ${league.name}`);
    console.log(`Starting budget in config:`, league.startingBudget);
    
    // Find all bids by this team since the beginning
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        bidderDiscordId: team.discordId
    }).toArray();
    
    console.log('\n--- All Bids Placed by HUMANES FC ---');
    bids.sort((a, b) => a.createdAt - b.createdAt);
    for (const b of bids) {
        console.log(`- Date: ${b.createdAt.toISOString()} | Player: ${b.eaPlayerName} | Bid: ${b.bidAmount.toLocaleString()} € | Status: ${b.status}`);
    }
    
    // Find all buyouts involving this team
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        $or: [
            { buyerTeamId: team._id.toString() },
            { sellerTeamId: team._id.toString() }
        ]
    }).toArray();
    
    console.log('\n--- All Buyouts Involving HUMANES FC ---');
    buyouts.sort((a, b) => a.createdAt - b.createdAt);
    for (const bo of buyouts) {
        const isBuyer = bo.buyerTeamId === team._id.toString();
        console.log(`- Date: ${bo.createdAt.toISOString()} | Player: ${bo.playerName} | Amount: ${bo.clauseAmount.toLocaleString()} € | Role: ${isBuyer ? 'Buyer' : 'Seller'}`);
    }
    
    // Let's print the actual balance changes step-by-step
    let calcBalance = league.startingBudget || 100000000;
    console.log(`\n--- STEP-BY-STEP CALCULATION OF BALANCE ---`);
    console.log(`[START] Initial Balance: ${calcBalance.toLocaleString()} €`);
    
    // We will combine all events (Bids placed, Bids resolved/refunded, Sales, Buyouts, Rewards) and sort by date.
    const events = [];
    
    // Bids placement (deduction)
    for (const b of bids) {
        events.push({
            date: b.createdAt,
            type: 'bid_placed',
            amount: -b.bidAmount,
            desc: `Bid placed on free agent ${b.eaPlayerName}: -${b.bidAmount.toLocaleString()} €`
        });
        
        if (b.status === 'rejected') {
            // Need to find when it was rejected and refunded
            // Normally, bids are rejected during the market resolution at 19:00 (Madrid time) of that day.
            // Let's approximate the date of rejection/refund to the next 19:00 Madrid time.
            const placementDate = new Date(b.createdAt);
            const refundDate = new Date(placementDate);
            refundDate.setUTCHours(17, 0, 0, 0); // 17:00 UTC = 19:00 Madrid (standard)
            if (refundDate < placementDate) {
                refundDate.setUTCDate(refundDate.getUTCDate() + 1);
            }
            events.push({
                date: refundDate,
                type: 'bid_refunded',
                amount: b.bidAmount,
                desc: `Bid on ${b.eaPlayerName} rejected. Refunded: +${b.bidAmount.toLocaleString()} €`
            });
        }
    }
    
    // Buyouts
    for (const bo of buyouts) {
        const isBuyer = bo.buyerTeamId === team._id.toString();
        events.push({
            date: bo.createdAt,
            type: isBuyer ? 'buyout_paid' : 'buyout_received',
            amount: isBuyer ? -bo.clauseAmount : bo.clauseAmount,
            desc: isBuyer 
                ? `Bought player ${bo.playerName} via buyout: -${bo.clauseAmount.toLocaleString()} €` 
                : `Sold player ${bo.playerName} via buyout: +${bo.clauseAmount.toLocaleString()} €`
        });
    }
    
    // News rewards & league sales
    const allNews = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    for (const n of allNews) {
        const msg = n.message || '';
        const lowerMsg = msg.toLowerCase();
        
        if (lowerMsg.includes('humanes')) {
            if (n.type === 'venta' && lowerMsg.includes('ha sido traspasado a **la liga**')) {
                const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    events.push({
                        date: n.createdAt,
                        type: 'league_sale',
                        amount: amt,
                        desc: `Sold ${msg.split('**')[1]} to La Liga: +${amt.toLocaleString()} €`
                    });
                }
            } else if (n.type === 'reward' && lowerMsg.includes('recibe')) {
                const match = msg.match(/recibe \*\*?([0-9.]+)\s*€\*\*?/i) || msg.match(/recibe ([0-9.]+)\s*€/i);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    events.push({
                        date: n.createdAt,
                        type: 'points_reward',
                        amount: amt,
                        desc: `Points reward: +${amt.toLocaleString()} €`
                    });
                }
            }
        }
    }
    
    // Sort events chronologically
    events.sort((a, b) => a.date - b.date);
    
    for (const e of events) {
        calcBalance += e.amount;
        console.log(`- ${e.date.toISOString()} | [${e.type}] ${e.desc} | Running Balance: ${calcBalance.toLocaleString()} €`);
    }
    
    console.log(`\nFinal Calculated Balance (Theoretical): ${calcBalance.toLocaleString()} €`);
    console.log(`Actual Database Balance: ${team.balance.toLocaleString()} €`);
    console.log(`Difference (Actual - Theoretical): ${(team.balance - calcBalance).toLocaleString()} €`);
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
