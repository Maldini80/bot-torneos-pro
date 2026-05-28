import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find all active leagues
    const leagues = await db.collection('fantasy_leagues').find({ status: { $ne: 'closed' } }).toArray();
    console.log(`Auditing all active leagues (total: ${leagues.length})...\n`);
    
    for (const league of leagues) {
        const teams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
        const buyouts = await db.collection('fantasy_buyouts').find({ leagueId: league._id.toString() }).toArray();
        const bids = await db.collection('fantasy_market_bids').find({ leagueId: league._id.toString() }).toArray();
        const news = await db.collection('fantasy_news').find({ leagueId: league._id.toString() }).toArray();
        
        let leagueHasDiscrepancy = false;
        const initialBudget = league.initialBudget || 150000000;
        
        for (const team of teams) {
            let calcBalance = initialBudget;
            
            // Bids placed and refunded
            const teamBids = bids.filter(b => b.bidderDiscordId === team.discordId);
            for (const b of teamBids) {
                calcBalance -= b.bidAmount;
                if (b.status === 'rejected') {
                    calcBalance += b.bidAmount;
                }
            }
            
            // Buyouts
            const teamBuyouts = buyouts.filter(bo => bo.buyerDiscordId === team.discordId || bo.sellerDiscordId === team.discordId);
            for (const bo of teamBuyouts) {
                // Find related news to get clauseAmount
                const relatedNews = news.find(n => n.type === 'clausulazo' && n.message.includes(bo.eaPlayerName) && Math.abs(new Date(n.createdAt) - new Date(bo.timestamp)) < 5000);
                let amount = 0;
                if (relatedNews) {
                    const match = relatedNews.message.match(/de \*\*([0-9.]+)\s*€\*\*/);
                    if (match) {
                        amount = parseInt(match[1].replace(/\./g, ''), 10);
                    }
                }
                if (amount > 0) {
                    if (bo.buyerDiscordId === team.discordId) {
                        calcBalance -= amount;
                    } else {
                        calcBalance += amount;
                    }
                }
            }
            
            // Sales and Rewards
            for (const n of news) {
                const msg = n.message || '';
                const lowerMsg = msg.toLowerCase();
                const teamNameLower = team.teamName.toLowerCase();
                
                if (lowerMsg.includes(teamNameLower)) {
                    if (n.type === 'venta' && lowerMsg.includes('ha sido traspasado a **la liga**')) {
                        const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                        if (match) {
                            calcBalance += parseInt(match[1].replace(/\./g, ''), 10);
                        }
                    } else if (n.type === 'reward' && lowerMsg.includes('recibe')) {
                        const match = msg.match(/recibe \*\*?([0-9.]+)\s*€\*\*?/i) || msg.match(/recibe ([0-9.]+)\s*€/i);
                        if (match) {
                            calcBalance += parseInt(match[1].replace(/\./g, ''), 10);
                        }
                    }
                }
            }
            
            const diff = team.balance - calcBalance;
            if (Math.abs(diff) > 100) { // Tolerance of 100 €
                leagueHasDiscrepancy = true;
                break;
            }
        }
        
        console.log(`League: "${league.name}" | Status: ${league.status} | Has balance discrepancies: ${leagueHasDiscrepancy ? '⚠️ YES' : '✅ NO'}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
