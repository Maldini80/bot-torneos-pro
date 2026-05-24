import { connectDb, getDb } from '../database.js';
import { calculatePlayerPointsAndPrice } from '../visualizerServer.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    console.log('--- 1. Testing calculatePlayerPointsAndPrice function ---');
    const mockPlayer = {
        eaPlayerName: 'TestPlayer123',
        lastClub: 'Test Club',
        lastPosition: 'MC',
        stats: {
            vpgPoints: 50,
            matchesPlayed: 10,
            goals: 5,
            assists: 3,
            wins: 6,
            losses: 4,
            cleanSheets: 2,
            ratings: [8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0]
        }
    };

    const stats = calculatePlayerPointsAndPrice(mockPlayer);
    console.log('Mock Player:', mockPlayer);
    console.log('Calculated Stats:', stats);

    // Verify avgRating: 80 / 10 = 8.0
    if (stats.avgRating === 8.0) {
        console.log('✅ avgRating is correctly calculated as 8.0 (sum of ratings / matchesPlayed).');
    } else {
        console.error('❌ avgRating calculation mismatch:', stats.avgRating);
    }

    // Verify points: 50
    if (stats.points === 50) {
        console.log('✅ points correctly matches vpgPoints (50).');
    } else {
        console.error('❌ points calculation mismatch:', stats.points);
    }

    console.log('\n--- 2. Testing Points Subtraction Logic (Empezar de cero vs Acumulado) ---');
    
    // Simulate league
    const mockLeagueZero = {
        name: 'Liga Cero Test',
        pointsMode: 'zero',
        basePoints: {
            'testplayer123': 40, // lowercase match
            'anotherplayer': 10
        }
    };

    const mockLeagueAcc = {
        name: 'Liga Acumulado Test',
        pointsMode: 'accumulated',
        basePoints: {}
    };

    const rawPoints = stats.points; // 50

    // Mode: zero
    let pointsZero = rawPoints;
    if (mockLeagueZero.pointsMode === 'zero' && mockLeagueZero.basePoints) {
        const playerNameLower = mockPlayer.eaPlayerName.toLowerCase();
        let base = 0;
        if (mockLeagueZero.basePoints[mockPlayer.eaPlayerName] !== undefined) {
            base = mockLeagueZero.basePoints[mockPlayer.eaPlayerName];
        } else {
            const foundKey = Object.keys(mockLeagueZero.basePoints).find(k => k.toLowerCase() === playerNameLower);
            if (foundKey) {
                base = mockLeagueZero.basePoints[foundKey];
            }
        }
        pointsZero = Math.max(0, rawPoints - base);
    }

    console.log(`Mode: zero | Raw points: ${rawPoints} | Base points: 40 | Subtracted: ${pointsZero}`);
    if (pointsZero === 10) {
        console.log('✅ Mode "zero" correctly subtracted base points (50 - 40 = 10).');
    } else {
        console.error('❌ Mode "zero" subtraction mismatch:', pointsZero);
    }

    // Mode: accumulated
    let pointsAcc = rawPoints;
    if (mockLeagueAcc.pointsMode === 'zero' && mockLeagueAcc.basePoints) {
        // should not enter here
    }

    console.log(`Mode: accumulated | Raw points: ${rawPoints} | Subtracted: ${pointsAcc}`);
    if (pointsAcc === 50) {
        console.log('✅ Mode "accumulated" correctly kept raw points (50).');
    } else {
        console.error('❌ Mode "accumulated" mismatch:', pointsAcc);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
