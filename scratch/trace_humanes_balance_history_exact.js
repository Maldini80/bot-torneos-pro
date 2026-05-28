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
    const initialBudget = league.initialBudget || 150000000;
    
    // 1. Bids placed & refunded
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        bidderDiscordId: team.discordId
    }).toArray();
    
    for (const b of bids) {
        timeline.push({
            date: new Date(b.createdAt),
            type: 'bid_placed',
            amount: -b.bidAmount,
            details: `Placed bid on free agent ${b.eaPlayerName} for ${b.bidAmount.toLocaleString('es-ES')} €`
        });
        
        if (b.status === 'rejected') {
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
    
    // 2. Buyouts with exact values from news
    const buyoutsList = [
        { name: 'KTDNrubo', type: 'buyout_received', amount: 19875000, date: '2026-05-27T00:36:26.554Z' },
        { name: 'alegrima', type: 'buyout_received', amount: 15150000, date: '2026-05-27T08:24:22.018Z' },
        { name: 'rraay', type: 'buyout_paid', amount: -10575000, date: '2026-05-27T10:27:39.699Z' },
        { name: 'elkrakenn23_', type: 'buyout_paid', amount: -19350000, date: '2026-05-27T10:28:20.314Z' },
        { name: 'GERIGF111', type: 'buyout_received', amount: 9000000, date: '2026-05-27T15:41:38.695Z' },
        { name: 'gonxi88', type: 'buyout_paid', amount: -17775000, date: '2026-05-28T15:37:03.695Z' },
        { name: 'iSekinha', type: 'buyout_paid', amount: -10425000, date: '2026-05-28T16:35:59.748Z' }
    ];
    
    for (const bo of buyoutsList) {
        timeline.push({
            date: new Date(bo.date),
            type: bo.type,
            amount: bo.amount,
            details: `${bo.type === 'buyout_paid' ? 'Paid' : 'Received'} buyout for ${bo.name}: ${Math.abs(bo.amount).toLocaleString('es-ES')} €`
        });
    }
    
    // 3. News rewards and sales
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
                        details: `Sold player to La Liga: +${amt.toLocaleString('es-ES')} €`
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
                        details: `Points reward: +${amt.toLocaleString('es-ES')} €`
                    });
                }
            }
        }
    }
    
    // Sort timeline
    timeline.sort((a, b) => a.date - b.date);
    
    console.log(`\n--- Exact Chronological Timeline (Initial: ${initialBudget.toLocaleString('es-ES')} €) ---`);
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
