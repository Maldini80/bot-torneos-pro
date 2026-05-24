import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import { calculatePlayerPointsAndPrice, getActiveFantasyTeams } from '../visualizerServer.js';

async function main() {
    await connectDb();
    const db = getDb();
    
    const leagueId = '6a0f8c20ae3aed564b3915a4';
    const leagueDoc = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
    
    if (!leagueDoc) {
        console.error("League not found!");
        process.exit(1);
    }
    
    console.log("League name:", leagueDoc.name);
    console.log("Points mode:", leagueDoc.pointsMode);
    console.log("vpgLeagues:", leagueDoc.vpgLeagues);
    
    const { activeLeagues } = await getActiveFantasyTeams(db, leagueDoc.vpgLeagues);
    const leaguesToQuery = leagueDoc.vpgLeagues || activeLeagues;
    console.log("Leagues to query:", leaguesToQuery);
    
    const rawPlayers = await db.collection('player_profiles').find({
        vpgLeagueSlug: { $in: leaguesToQuery }
    }).toArray();
    
    console.log(`Found ${rawPlayers.length} total players matching slugs.`);
    
    const targetNames = ['MonKeyDFFYLU', 'ruben10_03', 'Aaron14', 'adrilopez710'];
    
    for (const name of targetNames) {
        console.log(`\n--- Player: ${name} ---`);
        const p = rawPlayers.find(pl => pl.eaPlayerName.toLowerCase() === name.toLowerCase());
        if (!p) {
            console.log("Player not found in rawPlayers!");
            // Check in player_profiles directly
            const direct = await db.collection('player_profiles').findOne({ eaPlayerName: new RegExp('^' + name + '$', 'i') });
            if (direct) {
                console.log(`Direct lookup found him: vpgLeagueSlug = "${direct.vpgLeagueSlug}"`);
            } else {
                console.log("Direct lookup also not found!");
            }
            continue;
        }
        
        const { price, points: rawPoints, avgRating } = calculatePlayerPointsAndPrice(p);
        let points = rawPoints;
        let base = 0;
        let foundBaseKey = null;
        
        if (leagueDoc.basePoints) {
            const playerNameLower = p.eaPlayerName.toLowerCase();
            if (leagueDoc.basePoints[p.eaPlayerName] !== undefined) {
                base = leagueDoc.basePoints[p.eaPlayerName];
                foundBaseKey = p.eaPlayerName;
            } else {
                const foundKey = Object.keys(leagueDoc.basePoints).find(k => k.toLowerCase() === playerNameLower);
                if (foundKey) {
                    base = leagueDoc.basePoints[foundKey];
                    foundBaseKey = foundKey;
                }
            }
            points = Math.max(0, rawPoints - base);
        }
        
        console.log(`stats.vpgPoints in DB: ${p.stats?.vpgPoints}`);
        console.log(`calculatePlayerPointsAndPrice.points: ${rawPoints}`);
        console.log(`basePoints found in league: ${base} (key: ${foundBaseKey})`);
        console.log(`Calculated points (rawPoints - base): ${points}`);
    }
    
    process.exit(0);
}

main().catch(console.error);
