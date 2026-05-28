import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagueId = "6a10abe66bb40cd90498cca8"; // jam esports
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
        const basePointsMap = league.basePoints || {};
        
        const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
        const ownedPlayers = new Set();
        teams.forEach(t => {
            if (Array.isArray(t.players)) {
                t.players.forEach(p => ownedPlayers.add(p));
            }
        });
        
        console.log(`=== AUDITING ALL OWNED PLAYERS IN JAM ESPORTS ===`);
        
        let countZeroOrUndefined = 0;
        for (const pName of ownedPlayers) {
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: pName });
            const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === pName.toLowerCase());
            const baseVal = foundKey ? basePointsMap[foundKey] : undefined;
            
            if (baseVal === 0 || baseVal === undefined) {
                countZeroOrUndefined++;
                console.log(`- Player: "${pName}" | BasePoints: ${baseVal ?? 'UNDEFINED'} | Raw VPG Points: ${player?.stats?.vpgPoints ?? 0}`);
            }
        }
        
        console.log(`\nTotal owned players with base 0/undefined: ${countZeroOrUndefined}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
