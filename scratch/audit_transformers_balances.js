import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    console.log(`Auditing League: ${league.name} (Initial Budget: ${(league.initialBudget || 150000000).toLocaleString()} €)`);
    
    const teams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
    const news = await db.collection('fantasy_news').find({ leagueId: league._id.toString() }).toArray();
    
    // Sort news by date
    news.sort((a, b) => a.createdAt - b.createdAt);
    
    for (const team of teams) {
        console.log(`\n========================================`);
        console.log(`Team: ${team.teamName} (Owner: ${team.discordUsername} / ${team.discordId})`);
        console.log(`Current DB Balance: ${team.balance.toLocaleString()} €`);
        
        // Find bids by this user
        const bids = await db.collection('fantasy_market_bids').find({
            leagueId: league._id.toString(),
            bidderDiscordId: team.discordId
        }).toArray();
        
        let calcBalance = league.initialBudget || 150000000;
        const events = [];
        
        // Add bids placed and refunded
        for (const b of bids) {
            events.push({
                date: b.createdAt,
                type: 'bid_placed',
                amount: -b.bidAmount,
                desc: `Bid placed on ${b.eaPlayerName}: -${b.bidAmount.toLocaleString()} €`
            });
            
            if (b.status === 'rejected') {
                const placementDate = new Date(b.createdAt);
                const refundDate = new Date(placementDate);
                refundDate.setUTCHours(17, 0, 0, 0);
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
        
        // Add events from news involving this team
        for (const n of news) {
            const msg = n.message || '';
            const lowerMsg = msg.toLowerCase();
            const teamNameLower = team.teamName.toLowerCase();
            
            if (lowerMsg.includes(teamNameLower)) {
                if (n.type === 'venta' && lowerMsg.includes('ha sido traspasado a **la liga**')) {
                    const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                    if (match) {
                        const amt = parseInt(match[1].replace(/\./g, ''), 10);
                        events.push({
                            date: n.createdAt,
                            type: 'league_sale',
                            amount: amt,
                            desc: `Sold player to La Liga: +${amt.toLocaleString()} €`
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
                } else if (n.type === 'clausulazo') {
                    if (lowerMsg.includes(`el equipo **${teamNameLower}** ha pagado`)) {
                        const match = msg.match(/de \*\*([0-9.]+)\s*€\*\*/);
                        if (match) {
                            const amt = parseInt(match[1].replace(/\./g, ''), 10);
                            events.push({
                                date: n.createdAt,
                                type: 'buyout_paid',
                                amount: -amt,
                                desc: `Bought player via buyout: -${amt.toLocaleString()} €`
                            });
                        }
                    } else if (lowerMsg.includes(`al equipo **${teamNameLower}**`)) {
                        const match = msg.match(/de \*\*([0-9.]+)\s*€\*\*/);
                        if (match) {
                            const amt = parseInt(match[1].replace(/\./g, ''), 10);
                            events.push({
                                date: n.createdAt,
                                type: 'buyout_received',
                                amount: amt,
                                desc: `Sold player via buyout: +${amt.toLocaleString()} €`
                            });
                        }
                    }
                }
            }
        }
        
        events.sort((a, b) => a.date - b.date);
        
        for (const e of events) {
            calcBalance += e.amount;
        }
        
        const diff = team.balance - calcBalance;
        console.log(`Calculated running balance (including pending): ${calcBalance.toLocaleString()} €`);
        console.log(`Difference (Actual DB - Calc): ${diff.toLocaleString()} €`);
        if (Math.abs(diff) > 0) {
            console.log(`  WARNING: Discrepancy of ${diff.toLocaleString()} €!`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
