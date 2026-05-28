import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const leagueId = league._id.toString();
    const initialBudget = league.initialBudget || 150000000;
    
    const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
    const bids = await db.collection('fantasy_market_bids').find({ leagueId }).toArray();
    const buyouts = await db.collection('fantasy_buyouts').find({ leagueId }).toArray();
    const news = await db.collection('fantasy_news').find({ leagueId }).toArray();
    
    console.log(`Reconciling TRANSFORMERS CF balances...\n`);
    
    for (const team of teams) {
        console.log(`\n==================================================`);
        console.log(`Team: ${team.teamName} (${team.discordUsername} / ${team.discordId})`);
        console.log(`Current DB Balance: ${team.balance.toLocaleString()} €`);
        
        const timeline = [];
        
        // 1. Bids placed by this team
        const teamBids = bids.filter(b => b.bidderDiscordId === team.discordId);
        for (const b of teamBids) {
            timeline.push({
                date: new Date(b.createdAt),
                type: 'bid_placed',
                amount: -b.bidAmount,
                desc: `Bid placed on ${b.eaPlayerName}: -${b.bidAmount.toLocaleString()} €`
            });
            
            if (b.status === 'rejected') {
                // Determine when the refund would occur
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
                    desc: `Refund for rejected bid on ${b.eaPlayerName}: +${b.bidAmount.toLocaleString()} €`
                });
            }
        }
        
        // 2. Buyouts involving this team
        const teamBuyouts = buyouts.filter(bo => bo.buyerDiscordId === team.discordId || bo.sellerDiscordId === team.discordId);
        for (const bo of teamBuyouts) {
            // Find clauseAmount from the corresponding news item
            const relatedNews = news.find(n => n.type === 'clausulazo' && n.message.includes(bo.eaPlayerName) && Math.abs(new Date(n.createdAt) - new Date(bo.timestamp)) < 5000);
            let amount = 0;
            if (relatedNews) {
                const match = relatedNews.message.match(/de \*\*([0-9.]+)\s*€\*\*/);
                if (match) {
                    amount = parseInt(match[1].replace(/\./g, ''), 10);
                }
            }
            
            if (amount === 0) {
                console.log(`  Warning: Could not determine clauseAmount for buyout of ${bo.eaPlayerName}`);
                continue;
            }
            
            if (bo.buyerDiscordId === team.discordId) {
                timeline.push({
                    date: new Date(bo.timestamp),
                    type: 'buyout_paid',
                    amount: -amount,
                    desc: `Bought ${bo.eaPlayerName} via buyout: -${amount.toLocaleString()} €`
                });
            } else {
                timeline.push({
                    date: new Date(bo.timestamp),
                    type: 'buyout_received',
                    amount: amount,
                    desc: `Sold ${bo.eaPlayerName} via buyout: +${amount.toLocaleString()} €`
                });
            }
        }
        
        // 3. Sales to La Liga and Point Rewards from news
        for (const n of news) {
            const msg = n.message || '';
            const lowerMsg = msg.toLowerCase();
            const teamNameLower = team.teamName.toLowerCase();
            
            if (lowerMsg.includes(teamNameLower)) {
                if (n.type === 'venta' && lowerMsg.includes('ha sido traspasado a **la liga**')) {
                    const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                    if (match) {
                        const amt = parseInt(match[1].replace(/\./g, ''), 10);
                        timeline.push({
                            date: new Date(n.createdAt),
                            type: 'league_sale',
                            amount: amt,
                            desc: `Sold player to La Liga: +${amt.toLocaleString()} €`
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
                            desc: `Points reward: +${amt.toLocaleString()} €`
                        });
                    }
                }
            }
        }
        
        // Sort timeline chronologically
        timeline.sort((a, b) => a.date - b.date);
        
        let runningBalance = initialBudget;
        console.log(`Timeline:`);
        for (const event of timeline) {
            runningBalance += event.amount;
            console.log(`  [${event.date.toISOString()}] ${event.type.padEnd(16)} | Balance: ${runningBalance.toLocaleString().padStart(15)} € | ${event.desc}`);
        }
        
        const diff = team.balance - runningBalance;
        console.log(`\nFinal Calculated (Theoretical): ${runningBalance.toLocaleString()} €`);
        console.log(`Actual DB Balance: ${team.balance.toLocaleString()} €`);
        console.log(`Difference (Actual - Calc): ${diff.toLocaleString()} €`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
