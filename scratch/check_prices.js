import { getDb } from '../database.js';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

async function run() {
    const db = getDb();
    const playerColl = db.collection('player_profiles');

    const names = ['Stam13!', 'xDiiego10#6089', 'satitajr', 'xKaoTikz'];
    
    for (const name of names) {
        const p = await playerColl.findOne({
            eaPlayerName: { $regex: new RegExp('^' + name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        });
        if (!p) {
            console.log(`Player ${name} not found.`);
            continue;
        }

        const calculated = calculatePlayerPointsAndPrice(p);
        console.log(`\n--- Player: ${p.eaPlayerName} ---`);
        console.log(`Position: ${p.lastPosition} (Manual: ${p.manualPosition || 'none'})`);
        console.log(`Manual Price: ${p.manualPrice}`);
        console.log(`Calculated Price: ${calculated.price.toLocaleString('es-ES')} €`);
        console.log(`VPG Points: ${p.stats?.vpgPoints || 0}`);
        console.log(`Matches Played: ${p.stats?.matchesPlayed || 0}`);
        console.log(`Goals: ${p.stats?.goals || 0}`);
        console.log(`Assists: ${p.stats?.assists || 0}`);
        console.log(`Clean Sheets: ${p.stats?.cleanSheets || 0}`);
        console.log(`Wins: ${p.stats?.wins || 0}`);
        console.log(`Losses: ${p.stats?.losses || 0}`);
        console.log(`Avg Rating: ${calculated.avgRating}`);
    }
    process.exit(0);
}

run().catch(console.error);
