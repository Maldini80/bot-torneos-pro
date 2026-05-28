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
    
    // Find all news in this league
    const allNews = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    allNews.sort((a, b) => a.createdAt - b.createdAt);
    
    console.log('\n--- Timeline of all transactions for HUMANES FC ---');
    let balance = league.startingBudget || 100000000;
    console.log(`[START] Initial Balance: ${balance.toLocaleString()} €`);
    
    for (const n of allNews) {
        const msg = n.message || '';
        const lowerMsg = msg.toLowerCase();
        
        // Check if this news involves HUMANES FC
        if (lowerMsg.includes('humanes')) {
            // Parse transaction details
            let change = 0;
            let type = '';
            
            if (n.type === 'fichaje' && lowerMsg.includes('ha fichado al agente libre')) {
                // HUMANES FC bought a player from market
                // Format: El equipo **HUMANES FC** ha fichado al agente libre **...** por **... €**
                const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    change = -amt;
                    type = `Fichaje Mercado`;
                }
            } else if (n.type === 'venta' && lowerMsg.includes('ha sido traspasado a **la liga**')) {
                // HUMANES FC sold a player to La Liga
                // Format: El jugador **...** ha sido traspasado a **La Liga** (máquina) por **... €** procedente del equipo **HUMANES FC**
                const match = msg.match(/por \*\*([0-9.]+)\s*€\*\*/);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    change = amt;
                    type = `Venta a La Liga`;
                }
            } else if (n.type === 'clausulazo') {
                if (lowerMsg.includes('el equipo **humanes fc** ha pagado')) {
                    // HUMANES FC bought via buyout
                    const match = msg.match(/de \*\*([0-9.]+)\s*€\*\*/);
                    if (match) {
                        const amt = parseInt(match[1].replace(/\./g, ''), 10);
                        change = -amt;
                        type = `Compra Clausulazo (Pagó)`;
                    }
                } else if (lowerMsg.includes('al equipo **humanes fc**')) {
                    // Someone stole a player from HUMANES FC
                    const match = msg.match(/de \*\*([0-9.]+)\s*€\*\*/);
                    if (match) {
                        const amt = parseInt(match[1].replace(/\./g, ''), 10);
                        change = amt;
                        type = `Venta Clausulazo (Recibió)`;
                    }
                }
            } else if (n.type === 'reward' && lowerMsg.includes('recibe')) {
                // Recompensa jornada
                const match = msg.match(/recibe \*\*?([0-9.]+)\s*€\*\*?/i) || msg.match(/recibe ([0-9.]+)\s*€/i);
                if (match) {
                    const amt = parseInt(match[1].replace(/\./g, ''), 10);
                    change = amt;
                    type = `Recompensa Jornada`;
                }
            } else if (n.type === 'admin_action' && lowerMsg.includes('puntos') && lowerMsg.includes('humanes')) {
                // Check if admin manually modified points or balance
                console.log(`[ADMIN ACTION] ${msg}`);
            }
            
            if (change !== 0) {
                balance += change;
                console.log(`- ${n.createdAt.toISOString()} | [${type}] ${msg.replace(/\*\*/g, '')} | Change: ${change.toLocaleString()} € | Running Balance: ${balance.toLocaleString()} €`);
            } else {
                console.log(`- ${n.createdAt.toISOString()} | [Info] ${msg.replace(/\*\*/g, '')}`);
            }
        }
    }
    
    // Check pending bids in the database
    const pendingBids = await db.collection('fantasy_market_bids').find({
        bidderDiscordId: team.discordId,
        leagueId: league._id.toString(),
        status: 'pending'
    }).toArray();
    
    console.log('\n--- Active Pending Bids ---');
    let totalPendingBidsAmount = 0;
    for (const pb of pendingBids) {
        console.log(`- Player: ${pb.eaPlayerName} | Bid: ${pb.bidAmount.toLocaleString()} €`);
        totalPendingBidsAmount += pb.bidAmount;
    }
    console.log(`Total Pending Bids: ${totalPendingBidsAmount.toLocaleString()} €`);
    console.log(`Expected balance AFTER pending bids: ${(balance - totalPendingBidsAmount).toLocaleString()} €`);
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
