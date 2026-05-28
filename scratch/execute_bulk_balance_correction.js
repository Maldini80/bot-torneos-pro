import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

// Set to true to actually apply the changes in the database, false to only simulate
const DRY_RUN = false;

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find all active leagues
    const leagues = await db.collection('fantasy_leagues').find({ status: { $ne: 'closed' } }).toArray();
    console.log(`=== STARTING BULK BALANCE CORRECTION (DRY_RUN: ${DRY_RUN}) ===`);
    console.log(`Found ${leagues.length} active leagues to audit and correct.\n`);
    
    for (const league of leagues) {
        const leagueId = league._id.toString();
        const initialBudget = league.initialBudget || 150000000;
        
        const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
        const bids = await db.collection('fantasy_market_bids').find({ leagueId }).toArray();
        const buyouts = await db.collection('fantasy_buyouts').find({ leagueId }).toArray();
        const news = await db.collection('fantasy_news').find({ leagueId }).toArray();
        
        console.log(`\n------------------------------------------------------------`);
        console.log(`League: "${league.name}" (ID: ${leagueId})`);
        console.log(`------------------------------------------------------------`);
        
        let leagueHasUpdates = false;
        
        for (const team of teams) {
            let calcBalance = initialBudget;
            const timeline = [];
            
            // 1. Bids placed by this team
            const teamBids = bids.filter(b => b.bidderDiscordId === team.discordId);
            for (const b of teamBids) {
                // Deduct the bid when placed
                timeline.push({
                    type: 'bid_placed',
                    amount: -b.bidAmount,
                    desc: `Bid placed on ${b.eaPlayerName}: -${b.bidAmount}`
                });
                
                // Refund if rejected
                if (b.status === 'rejected') {
                    timeline.push({
                        type: 'bid_refunded',
                        amount: b.bidAmount,
                        desc: `Refund for rejected bid on ${b.eaPlayerName}: +${b.bidAmount}`
                    });
                }
            }
            
            // 2. Buyouts involving this team
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
                        timeline.push({
                            type: 'buyout_paid',
                            amount: -amount,
                            desc: `Paid buyout for ${bo.eaPlayerName}: -${amount}`
                        });
                    } else {
                        timeline.push({
                            type: 'buyout_received',
                            amount: amount,
                            desc: `Received buyout for ${bo.eaPlayerName}: +${amount}`
                        });
                    }
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
                                type: 'league_sale',
                                amount: amt,
                                desc: `Sold ${n.message.match(/\*\*([^*]+)\*\*/)?.[1] || 'player'} to La Liga: +${amt}`
                            });
                        }
                    } else if (n.type === 'reward' && lowerMsg.includes('recibe')) {
                        const match = msg.match(/recibe \*\*?([0-9.]+)\s*€\*\*?/i) || msg.match(/recibe ([0-9.]+)\s*€/i);
                        if (match) {
                            const amt = parseInt(match[1].replace(/\./g, ''), 10);
                            timeline.push({
                                type: 'points_reward',
                                amount: amt,
                                desc: `Points reward: +${amt}`
                            });
                        }
                    }
                }
            }
            
            // Sum all transactions
            for (const event of timeline) {
                calcBalance += event.amount;
            }
            
            const diff = team.balance - calcBalance;
            if (Math.abs(diff) > 100) {
                if (calcBalance > team.balance) {
                    leagueHasUpdates = true;
                    console.log(`  [UPDATE] Team: "${team.teamName}" (${team.discordUsername})`);
                    console.log(`    Current DB Balance: ${team.balance.toLocaleString()} €`);
                    console.log(`    Correct Balance:    ${calcBalance.toLocaleString()} €`);
                    console.log(`    Difference:         +${Math.abs(diff).toLocaleString()} € (Gaining money)`);
                    
                    if (!DRY_RUN) {
                        await db.collection('fantasy_teams').updateOne(
                            { _id: team._id },
                            { $set: { balance: calcBalance } }
                        );
                        
                        // Log news entry
                        const diffAbs = Math.abs(diff);
                        await db.collection('fantasy_news').insertOne({
                            leagueId: team.leagueId,
                            type: 'admin_action',
                            message: `📢 **AJUSTE DE SALDO**: Tras una auditoría de transacciones, se ha corregido el saldo del equipo **${team.teamName}** a **${calcBalance.toLocaleString('es-ES')} €** (Corrección: +${diffAbs.toLocaleString('es-ES')} €).`,
                            createdAt: new Date()
                        });
                        console.log(`    ✅ Updated in database and logged to news.`);
                    }
                } else {
                    console.log(`  [SKIP] Team: "${team.teamName}" (${team.discordUsername}) - would lose ${diff.toLocaleString()} € (Current: ${team.balance.toLocaleString()} €, Correct: ${calcBalance.toLocaleString()} €) - skipped as per instruction.`);
                }
            }
        }
        
        if (!leagueHasUpdates) {
            console.log(`  All teams in this league are already correct. ✅`);
        }
    }
    
    console.log(`\n=== BULK BALANCE CORRECTION FINISHED ===`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
