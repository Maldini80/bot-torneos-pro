import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

// We need the formula here to compute manually since we can't import easily
function calculatePlayerPointsAndPrice(p) {
    const stats = p.stats || {};
    const vpgPoints = stats.vpgPoints || 0;
    const matchesPlayed = stats.matchesPlayed || 0;
    
    let avgRating = 6.0;
    if (Array.isArray(stats.ratings) && stats.ratings.length > 0) {
        const sum = stats.ratings.reduce((acc, r) => acc + (parseFloat(r) || 0), 0);
        avgRating = sum / stats.ratings.length;
    }

    let price;
    const posUpper = (p.manualPosition || p.lastPosition || '').toUpperCase();
    const isGk = posUpper === 'POR' || posUpper === 'GK';

    if (p.manualPrice !== undefined && p.manualPrice !== null) {
        price = p.manualPrice;
    } else {
        price = 1000000;
        price += (stats.goals || 0) * 250000;
        price += (stats.assists || 0) * 200000;
        const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR', 'GK'].includes(posUpper);
        if (isDefOrGk) price += (stats.cleanSheets || 0) * 150000;
        
        price += (stats.wins || 0) * 50000;
        price -= (stats.losses || 0) * 25000;

        if (avgRating > 6.0) price *= (1 + (avgRating - 6.0) * 0.5);
        if (isGk) {
            price *= 2;
        }
        price *= 5.33333333;
    }

    price = Math.min(80000000, Math.max(2600000, price));
    price = Math.round(price / 50000) * 50000;

    return { price, points: vpgPoints, avgRating };
}

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const playerColl = db.collection('player_profiles');

        const names = ['satita', 'ivanovic'];
        
        for (const searchName of names) {
            const players = await playerColl.find({
                eaPlayerName: { $regex: new RegExp(searchName, 'i') }
            }).toArray();

            if (players.length === 0) {
                console.log(`No players found for search term: ${searchName}`);
                continue;
            }

            for (const p of players) {
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
                console.log(`Raw ratings length: ${p.stats?.ratings?.length || 0}`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
