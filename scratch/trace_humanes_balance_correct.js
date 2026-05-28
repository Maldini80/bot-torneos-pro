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
    
    console.log(`Team: ${team.teamName} (ID: ${team._id}), Owner: ${team.discordId}`);
    
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        bidderDiscordId: team.discordId
    }).toArray();
    
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    let calcBalance = league.initialBudget || 100000000;
    const events = [];
    
    // Bids placed by HUMANES FC (deducts from balance)
    for (const b of bids) {
        events.push({
            date: b.createdAt,
            type: 'bid_placed',
            amount: -b.bidAmount,
            desc: `Bid placed on free agent ${b.eaPlayerName}: -${b.bidAmount.toLocaleString()} €`
        });
        
        // If bid was rejected/cancelled, it gets refunded
        if (b.status === 'rejected') {
            const placementDate = new Date(b.createdAt);
            const refundDate = new Date(placementDate);
            refundDate.setUTCHours(17, 0, 0, 0); // 17:00 UTC = 19:00 Madrid
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
    
    // Parse buyouts, sales, rewards from news
    for (const n of news) {
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
                if (lowerMsg.includes('el equipo **humanes fc** ha pagado')) {
                    // HUMANES FC bought via buyout
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
                } else if (lowerMsg.includes('al equipo **humanes fc**')) {
                    // Someone stole a player from HUMANES FC
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
    
    // Sort events
    events.sort((a, b) => a.date - b.date);
    
    console.log(`\n--- STEP-BY-STEP CALCULATION OF BALANCE ---`);
    console.log(`[START] Initial Balance: ${calcBalance.toLocaleString()} €`);
    
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
