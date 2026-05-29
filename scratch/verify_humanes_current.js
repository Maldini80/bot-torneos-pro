import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find HUMANES FC in TRANSFORMERS CF
    const league = await db.collection('fantasy_leagues').findOne({ name: /TRANSFORMERS/i });
    if (!league) { console.log('League not found'); process.exit(1); }
    
    const leagueId = league._id.toString();
    console.log(`League: "${league.name}" (ID: ${leagueId})`);
    console.log(`Initial Budget: ${league.initialBudget?.toLocaleString('es-ES')} €`);
    
    const team = await db.collection('fantasy_teams').findOne({ leagueId, teamName: /HUMANES/i });
    if (!team) { console.log('Team not found'); process.exit(1); }
    
    console.log(`\nTeam: "${team.teamName}" (Discord: ${team.discordUsername})`);
    console.log(`Current Balance: ${team.balance?.toLocaleString('es-ES')} €`);
    console.log(`Players: ${team.players?.length || 0} - ${(team.players || []).join(', ')}`);
    
    // All bids by this team (current)
    const bids = await db.collection('fantasy_market_bids').find({ leagueId, bidderDiscordId: team.discordId }).toArray();
    console.log(`\n--- Current Bids by HUMANES (${bids.length}) ---`);
    let totalBidsPending = 0;
    for (const b of bids) {
        console.log(`  ${b.eaPlayerName}: ${b.bidAmount?.toLocaleString('es-ES')} € (status: ${b.status})`);
        if (b.status === 'pending') totalBidsPending += b.bidAmount;
    }
    console.log(`Total money in pending bids: ${totalBidsPending.toLocaleString('es-ES')} €`);
    
    // Buyouts involving this team
    const buyouts = await db.collection('fantasy_buyouts').find({ leagueId, $or: [{ buyerDiscordId: team.discordId }, { sellerDiscordId: team.discordId }] }).toArray();
    console.log(`\n--- Buyouts involving HUMANES (${buyouts.length}) ---`);
    for (const bo of buyouts) {
        const role = bo.buyerDiscordId === team.discordId ? 'BUYER' : 'SELLER';
        console.log(`  [${role}] ${bo.eaPlayerName} (${new Date(bo.timestamp).toISOString()})`);
    }
    
    // All news mentioning HUMANES 
    const allNews = await db.collection('fantasy_news').find({ leagueId }).sort({ createdAt: 1 }).toArray();
    const teamNews = allNews.filter(n => (n.message || '').toLowerCase().includes('humanes'));
    console.log(`\n--- All News mentioning HUMANES (${teamNews.length}) ---`);
    
    let totalSales = 0;
    let totalRewards = 0;
    let totalBuyoutsPaid = 0;
    let totalBuyoutsReceived = 0;
    
    for (const n of teamNews) {
        const msg = n.message || '';
        const date = new Date(n.createdAt).toISOString().slice(0, 16);
        console.log(`  [${date}] (${n.type}) ${msg.substring(0, 150)}`);
        
        // Track amounts
        if (n.type === 'venta' && msg.toLowerCase().includes('la liga')) {
            const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
            if (match) totalSales += parseInt(match[1].replace(/\./g, ''), 10);
        }
        if (n.type === 'reward' && msg.toLowerCase().includes('humanes')) {
            const match = msg.match(/recibe \*\*?([0-9.]+)\s*€\*\*?/i) || msg.match(/recibe ([0-9.]+)\s*€/i);
            if (match) totalRewards += parseInt(match[1].replace(/\./g, ''), 10);
        }
        if (n.type === 'clausulazo') {
            if (msg.toLowerCase().includes('humanes') && msg.includes('ha fichado')) {
                const match = msg.match(/de \*\*([0-9.]+)\s*€\*\*/);
                if (match) totalBuyoutsPaid += parseInt(match[1].replace(/\./g, ''), 10);
            }
            if (msg.toLowerCase().includes('humanes') && (msg.includes('del equipo') || msg.includes('de **humanes'))) {
                const match = msg.match(/de \*\*([0-9.]+)\s*€\*\*/);
                if (match) totalBuyoutsReceived += parseInt(match[1].replace(/\./g, ''), 10);
            }
        }
    }
    
    // Recalculate
    const initialBudget = league.initialBudget || 150000000;
    const calcBalance = initialBudget - totalBidsPending + totalSales + totalRewards - totalBuyoutsPaid + totalBuyoutsReceived;
    
    console.log(`\n=== BALANCE RECONSTRUCTION ===`);
    console.log(`Initial Budget:      ${initialBudget.toLocaleString('es-ES')} €`);
    console.log(`+ Sales to La Liga:  ${totalSales.toLocaleString('es-ES')} €`);
    console.log(`+ Rewards:           ${totalRewards.toLocaleString('es-ES')} €`);
    console.log(`+ Buyouts received:  ${totalBuyoutsReceived.toLocaleString('es-ES')} €`);
    console.log(`- Buyouts paid:      ${totalBuyoutsPaid.toLocaleString('es-ES')} €`);
    console.log(`- Pending bids:      ${totalBidsPending.toLocaleString('es-ES')} €`);
    console.log(`= Calculated:        ${calcBalance.toLocaleString('es-ES')} €`);
    console.log(`= Current DB:        ${team.balance?.toLocaleString('es-ES')} €`);
    console.log(`= Difference:        ${(team.balance - calcBalance)?.toLocaleString('es-ES')} €`);
    
    // Also check admin_action news (our correction)
    const corrections = allNews.filter(n => n.type === 'admin_action' && (n.message || '').toLowerCase().includes('humanes'));
    console.log(`\n--- Correction News ---`);
    for (const c of corrections) {
        console.log(`  [${new Date(c.createdAt).toISOString().slice(0, 16)}] ${c.message}`);
    }
    
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
