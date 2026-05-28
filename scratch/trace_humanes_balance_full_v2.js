import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /humanes/i
    });
    
    console.log(`Team: ${team.teamName} (ID: ${team._id}), Discord ID: ${team.discordId}`);
    console.log(`Current DB Balance: ${team.balance.toLocaleString('es-ES')} €`);
    
    const timeline = [];
    
    // 1. Get initial budget
    const initialBudget = league.initialBudget || 150000000;
    
    // 2. Get all bids by this user
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        bidderDiscordId: team.discordId
    }).toArray();
    
    for (const b of bids) {
        timeline.push({
            date: new Date(b.createdAt),
            type: 'bid_placed',
            amount: -b.bidAmount,
            details: `Placed bid on free agent ${b.eaPlayerName} for ${b.bidAmount.toLocaleString('es-ES')} € (Status: ${b.status}, ID: ${b._id})`
        });
        
        if (b.status === 'rejected') {
            // Find when the market resolved for this bid
            // FA bids resolve at 17:00 UTC (19:00 Madrid) on the next 17:00 UTC
            const placementDate = new Date(b.createdAt);
            const refundDate = new Date(placementDate);
            refundDate.setUTCHours(17, 0, 0, 0);
            if (refundDate < placementDate) {
                refundDate.setUTCDate(refundDate.getUTCDate() + 1);
            }
            timeline.push({
                date: refundDate,
                type: 'bid_refunded',
                amount: b.bidAmount,
                details: `Refunded rejected bid on ${b.eaPlayerName} for ${b.bidAmount.toLocaleString('es-ES')} €`
            });
        }
    }
    
    // 3. Get all buyouts (clausulazos)
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        $or: [
            { buyerDiscordId: team.discordId },
            { sellerDiscordId: team.discordId }
        ]
    }).toArray();
    
    for (const bo of buyouts) {
        const isBuyer = bo.buyerDiscordId === team.discordId;
        const amount = bo.clauseAmount || 0;
        timeline.push({
            date: new Date(bo.timestamp),
            type: isBuyer ? 'buyout_paid' : 'buyout_received',
            amount: isBuyer ? -amount : amount,
            details: `${isBuyer ? 'Paid' : 'Received'} buyout for ${bo.eaPlayerName}: ${amount.toLocaleString('es-ES')} € (ID: ${bo._id})`
        });
    }
    
    // 4. Get news for rewards and sales
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    for (const n of news) {
        const msg = n.message || '';
        const lowerMsg = msg.toLowerCase();
        
        if (lowerMsg.includes('humanes')) {
            if (n.type === 'venta' && lowerMsg.includes('ha sido traspasado a **la liga**')) {
                const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    timeline.push({
                        date: new Date(n.createdAt),
                        type: 'league_sale',
                        amount: amt,
                        details: `Sold player to La Liga: +${amt.toLocaleString('es-ES')} € (News ID: ${n._id}, Msg: ${msg})`
                    });
                }
            } else if (n.type === 'reward' && lowerMsg.includes('recibe')) {
                const match = msg.match(/recibe \*\*?([0-9.]+)\s*€\*\*?/i) || msg.match(/recibe ([0-9.]+)\s*€/i);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    timeline.push({
                        date: new Date(n.createdAt),
                        type: 'points_reward',
                        amount: amt,
                        details: `Points reward: +${amt.toLocaleString('es-ES')} € (News ID: ${n._id}, Msg: ${msg})`
                    });
                }
            }
        }
    }
    
    // Sort timeline
    timeline.sort((a, b) => a.date - b.date);
    
    console.log(`\n--- Chronological Timeline (Initial: ${initialBudget.toLocaleString('es-ES')} €) ---`);
    let balance = initialBudget;
    for (const event of timeline) {
        balance += event.amount;
        console.log(`[${event.date.toISOString()}] ${event.type.padEnd(16)} | Balance: ${balance.toLocaleString('es-ES').padStart(15)} € | ${event.details}`);
    }
    
    console.log(`\nTheoretical final balance: ${balance.toLocaleString('es-ES')} €`);
    console.log(`Actual DB balance: ${team.balance.toLocaleString('es-ES')} €`);
    console.log(`Difference: ${(team.balance - balance).toLocaleString('es-ES')} €`);
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
