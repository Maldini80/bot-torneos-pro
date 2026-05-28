import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import { ObjectId } from 'mongodb';

async function main() {
    try {
        await connectDb();
        const db = getDb();
        const leagueId = "6a143aef2618a9dc726b22ff";
        const leagueDoc = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
        if (!leagueDoc) {
            console.log("League not found.");
            process.exit(1);
        }
        console.log("League:", leagueDoc.name);
        
        const vpgLeagues = leagueDoc.vpgLeagues || [];
        const rawPlayers = await db.collection('player_profiles').find({
            vpgLeagueSlug: { $in: vpgLeagues }
        }).toArray();
        console.log(`Raw players in database: ${rawPlayers.length}`);

        const { calculatePlayerPointsAndPrice } = await import('../visualizerServer.js');

        const allEligiblePlayers = rawPlayers.map(p => {
            const { price } = calculatePlayerPointsAndPrice(p);
            return {
                eaPlayerName: p.eaPlayerName,
                lastPosition: p.manualPosition || p.lastPosition || 'MC',
                price
            };
        });

        const otherTeams = await db.collection('fantasy_teams').find({
            leagueId: leagueId.toString()
        }).toArray();
        const ownedPlayerNames = new Set();
        otherTeams.forEach(t => {
            (t.players || []).forEach(pName => ownedPlayerNames.add(pName.toLowerCase()));
        });
        console.log(`Owned players: ${ownedPlayerNames.size}`);

        const marketFreeAgents = new Set(
            Array.isArray(leagueDoc.marketFreeAgents)
                ? leagueDoc.marketFreeAgents.map(name => name.toLowerCase())
                : []
        );
        console.log(`Market free agents: ${marketFreeAgents.size}`);

        const pool = allEligiblePlayers.filter(p => {
            const nameLower = p.eaPlayerName.toLowerCase();
            if (ownedPlayerNames.has(nameLower)) return false;
            if (marketFreeAgents.has(nameLower)) return false;
            if (p.price > 55000000) return false;
            return true;
        });
        console.log(`Remaining pool: ${pool.length}`);

        function isGoalkeeper(pos) { return ['POR', 'GK'].includes(pos); }
        function isCentralDefender(pos) { return pos === 'DFC'; }
        function isLateral(pos) { return ['LD', 'LI', 'LTD', 'LTI', 'CARR', 'CAD', 'CAI', 'DFD', 'DFI'].includes(pos); }

        const poolPOR = pool.filter(p => isGoalkeeper(p.lastPosition));
        const poolCB = pool.filter(p => isCentralDefender(p.lastPosition));
        const poolDC = pool.filter(p => p.lastPosition === 'DC');
        const poolMCStrict = pool.filter(p => ['MC', 'MCD', 'MCO'].includes(p.lastPosition));
        const poolCARR = pool.filter(p => isLateral(p.lastPosition));

        console.log(`  poolPOR: ${poolPOR.length}`);
        console.log(`  poolCB: ${poolCB.length}`);
        console.log(`  poolDC: ${poolDC.length}`);
        console.log(`  poolMCStrict: ${poolMCStrict.length}`);
        console.log(`  poolCARR: ${poolCARR.length}`);
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

main().catch(console.error);
