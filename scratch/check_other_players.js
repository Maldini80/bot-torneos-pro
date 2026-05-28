import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerNames = [
            "CkB_Gabarre_23",
            "xNoux1900",
            "Ivanovicl5l",
            "ImNiTrO21",
            "TanqueRoldan22",
            "Dieguimor06",
            "yyeraxxyy",
            "Satiiita03",
            "Makensii-_-"
        ];
        
        console.log('Checking profiles for other JAM players...');
        for (const name of playerNames) {
            const p = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + name + '$', 'i') }
            });
            if (p) {
                console.log(`Player: ${p.eaPlayerName}`);
                console.log(` - lastActive: ${p.lastActive}`);
                console.log(` - lastPosition: ${p.lastPosition}`);
                console.log(` - vpgLeagueSlug: ${p.vpgLeagueSlug}`);
                console.log(` - VPG Profile:`, p.vpgProfile);
                console.log(` - vpgPoints: ${p.stats?.vpgPoints} | matchesPlayed: ${p.stats?.matchesPlayed}`);
            } else {
                console.log(`Player: ${name} -> NOT FOUND IN DB`);
            }
            console.log('---------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
