import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

function calculatePlayerPointsAndPrice(p) {
    const stats = p.stats || {};
    const matchesPlayed = stats.matchesPlayed || 0;
    
    let avgRating = 6.0;
    if (Array.isArray(stats.ratings) && stats.ratings.length > 0) {
        const sum = stats.ratings.reduce((acc, r) => acc + (parseFloat(r) || 0), 0);
        avgRating = sum / stats.ratings.length;
    }
    let price = 2600000; // minimum price fallback
    // simple fallback mock matching visualizerServer logic
    if (p.stats && p.stats.vpgPoints) {
        price = p.stats.vpgPoints * 1000000;
    }
    return { price };
}

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagueId = '6a1165ac92863afdcad3676f';
        const teamName = "toca y vete cacahuete";
        const testPlayerName = "belversingh"; // Let's use belversingh who is in Guinea Pink
        
        console.log(`\n=== Testing Add Player Logic (DB Simulation) ===`);
        
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
        const targetTeam = await db.collection('fantasy_teams').findOne({ leagueId, teamName });
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: testPlayerName });
        
        if (!league || !targetTeam || !player) {
            console.error('Missing documents for test:', { league: !!league, targetTeam: !!targetTeam, player: !!player });
            return;
        }
        
        console.log(`Target Team players before add:`, targetTeam.players);
        
        // 1. Check if already owned
        const pName = player.eaPlayerName;
        const ownerTeam = await db.collection('fantasy_teams').findOne({ leagueId, players: pName });
        if (ownerTeam) {
            console.log(`Player ${pName} is currently owned by team: ${ownerTeam.teamName}`);
            // Remove player from owner
            const ownerLineup = { ...ownerTeam.lineup };
            for (const pos in ownerLineup) {
                if (Array.isArray(ownerLineup[pos])) {
                    ownerLineup[pos] = ownerLineup[pos].filter(p => p !== pName);
                } else if (ownerLineup[pos] === pName) {
                    ownerLineup[pos] = null;
                }
            }
            await db.collection('fantasy_teams').updateOne(
                { _id: ownerTeam._id },
                {
                    $pull: { players: pName },
                    $set: { lineup: ownerLineup },
                    $unset: {
                        [`clauses.${pName}`]: "",
                        [`clausesProtectedUntil.${pName}`]: ""
                    }
                }
            );
            console.log(`Successfully removed ${pName} from previous owner team ${ownerTeam.teamName}.`);
        }
        
        // 2. Calculate dynamic clause
        const { price } = calculatePlayerPointsAndPrice(player);
        const clauseMultiplier = league.clauseMultiplier || 1.2;
        const initialClause = Math.round(price * clauseMultiplier);
        console.log(`Calculated dynamic price: ${price} €, Initial clause: ${initialClause} €`);
        
        // 3. Add player to target team
        await db.collection('fantasy_teams').updateOne(
            { _id: targetTeam._id },
            {
                $push: { players: pName },
                $set: {
                    [`clauses.${pName}`]: initialClause
                }
            }
        );
        console.log(`Successfully added ${pName} to ${targetTeam.teamName}.`);
        
        // 4. Verify additions
        let updatedTeam = await db.collection('fantasy_teams').findOne({ _id: targetTeam._id });
        console.log(`Target Team players after add:`, updatedTeam.players);
        console.log(`Target Team clauses for ${pName}:`, updatedTeam.clauses?.[pName]);
        
        console.log(`\n=== Testing Remove Player Logic (DB Simulation) ===`);
        
        // Remove player back
        const targetLineup = { ...updatedTeam.lineup };
        for (const pos in targetLineup) {
            if (Array.isArray(targetLineup[pos])) {
                targetLineup[pos] = targetLineup[pos].filter(p => p !== pName);
            } else if (targetLineup[pos] === pName) {
                targetLineup[pos] = null;
            }
        }
        
        await db.collection('fantasy_teams').updateOne(
            { _id: targetTeam._id },
            {
                $pull: { players: pName },
                $set: { lineup: targetLineup },
                $unset: {
                    [`clauses.${pName}`]: "",
                    [`clausesProtectedUntil.${pName}`]: ""
                }
            }
        );
        console.log(`Successfully removed ${pName} from ${targetTeam.teamName}.`);
        
        // Restore to original owner (Guinea Pink team) if they had him
        if (ownerTeam && ownerTeam.teamName !== targetTeam.teamName) {
            await db.collection('fantasy_teams').updateOne(
                { _id: ownerTeam._id },
                {
                    $push: { players: pName },
                    $set: {
                        [`clauses.${pName}`]: ownerTeam.clauses?.[pName] || initialClause
                    }
                }
            );
            console.log(`Restored ${pName} back to his original team ${ownerTeam.teamName}.`);
        }
        
        // Final verification
        const finalTeam = await db.collection('fantasy_teams').findOne({ _id: targetTeam._id });
        console.log(`Target Team players at the end:`, finalTeam.players);
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
