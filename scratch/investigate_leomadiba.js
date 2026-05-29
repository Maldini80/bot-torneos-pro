import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find STAFF league
    const league = await db.collection('fantasy_leagues').findOne({ name: /STAFF/i });
    if (!league) { console.log('League not found'); process.exit(1); }
    
    const leagueId = league._id.toString();
    console.log(`League: "${league.name}" (ID: ${leagueId})`);
    
    // Find leomadiba's team
    const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
    const leoTeam = teams.find(t => 
        (t.teamName || '').toLowerCase().includes('leomadiba') || 
        (t.discordUsername || '').toLowerCase().includes('leomadiba') ||
        (t.teamName || '').toLowerCase().includes('leo')
    );
    
    console.log(`\n--- All teams in league ---`);
    for (const t of teams) {
        const hasMikelma = (t.players || []).some(p => p.toLowerCase().includes('mikelma'));
        console.log(`  ${t.teamName} (${t.discordUsername}) - Balance: ${t.balance?.toLocaleString('es-ES')} € - Players: ${t.players?.length || 0}${hasMikelma ? ' *** HAS MIKELMA ***' : ''}`);
    }
    
    // Find ALL bids for mikelma in this league
    const mikelmaBids = await db.collection('fantasy_market_bids').find({ 
        leagueId, 
        eaPlayerName: { $regex: /mikelma/i }
    }).toArray();
    
    console.log(`\n--- All bids for mikelma (${mikelmaBids.length}) ---`);
    for (const b of mikelmaBids) {
        const bidderTeam = teams.find(t => t.discordId === b.bidderDiscordId);
        console.log(`  Bidder: ${bidderTeam?.teamName || b.bidderDiscordId} (${b.bidderTeamName})`);
        console.log(`    Amount: ${b.bidAmount?.toLocaleString('es-ES')} €`);
        console.log(`    Status: ${b.status}`);
        console.log(`    Seller: ${b.sellerDiscordId}`);
        console.log(`    Created: ${new Date(b.createdAt).toISOString()}`);
        console.log();
    }
    
    // Find bids by leomadiba (search broadly)
    console.log(`\n--- Searching for leomadiba's bids ---`);
    const allBids = await db.collection('fantasy_market_bids').find({ leagueId }).toArray();
    for (const b of allBids) {
        const bidderTeam = teams.find(t => t.discordId === b.bidderDiscordId);
        if ((bidderTeam?.teamName || '').toLowerCase().includes('leo') || 
            (bidderTeam?.discordUsername || '').toLowerCase().includes('leo') ||
            (b.bidderTeamName || '').toLowerCase().includes('leo')) {
            console.log(`  [${b.status}] ${b.eaPlayerName}: ${b.bidAmount?.toLocaleString('es-ES')} € (team: ${bidderTeam?.teamName}, seller: ${b.sellerDiscordId})`);
        }
    }
    
    // Check news for mikelma
    const mikelmaNews = await db.collection('fantasy_news').find({ 
        leagueId, 
        message: { $regex: /mikelma/i }
    }).sort({ createdAt: 1 }).toArray();
    
    console.log(`\n--- News mentioning mikelma (${mikelmaNews.length}) ---`);
    for (const n of mikelmaNews) {
        console.log(`  [${new Date(n.createdAt).toISOString().slice(0, 16)}] (${n.type}) ${(n.message || '').substring(0, 200)}`);
    }
    
    // Check market listings for mikelma
    const mikelmaListings = await db.collection('fantasy_market_listings').find({ 
        leagueId, 
        eaPlayerName: { $regex: /mikelma/i }
    }).toArray();
    
    console.log(`\n--- Market listings for mikelma (${mikelmaListings.length}) ---`);
    for (const l of mikelmaListings) {
        const sellerTeam = teams.find(t => t.discordId === l.sellerDiscordId);
        console.log(`  Seller: ${sellerTeam?.teamName || l.sellerDiscordId}`);
        console.log(`  Price: ${l.askingPrice?.toLocaleString('es-ES')} €`);
        console.log(`  Created: ${new Date(l.createdAt).toISOString()}`);
    }
    
    // Also check: who has mikelma in their players array?
    console.log(`\n--- Who has mikelma? ---`);
    for (const t of teams) {
        const mikelmaPlayer = (t.players || []).find(p => p.toLowerCase().includes('mikelma'));
        if (mikelmaPlayer) {
            console.log(`  ${t.teamName} has "${mikelmaPlayer}"`);
        }
    }
    
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
