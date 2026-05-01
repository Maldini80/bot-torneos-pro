import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.DATABASE_URL);
  await client.connect();
  
  const testDb = client.db('test');
  const teams = await testDb.collection('teams').find({ name: { $regex: /Columbus|Drift/i } }).toArray();
  console.log('Teams:', teams.map(t => ({name: t.name, eaClubId: t.eaClubId})));
  
  const clubIds = teams.map(t => String(t.eaClubId));
  if (clubIds.length >= 2) {
    const db = client.db('tournamentBotDb');
    // Fetch matches involving both teams
    const matches = await db.collection('scanned_matches').find({
      $and: [
        { [`match.clubs.${clubIds[0]}`]: { $exists: true } },
        { [`match.clubs.${clubIds[1]}`]: { $exists: true } }
      ]
    }).sort({ timestamp: -1 }).limit(10).toArray();
    
    console.log('Found matches:', matches.length);
    for (let m of matches) {
        console.log(`\nMatch ID: ${m.matchId}, Timestamp: ${m.timestamp}`);
        console.log('Goals: ', m.match.clubs[clubIds[0]]?.goals, '-', m.match.clubs[clubIds[1]]?.goals);
        
        let p1_conceded = 0, p2_conceded = 0;
        let p1_goals = 0, p2_goals = 0;
        
        if (m.match.players[clubIds[0]]) {
           Object.values(m.match.players[clubIds[0]]).forEach(p => {
               p1_goals += parseInt(p.goals||0);
               if (parseInt(p.goalsconceded||0) > p1_conceded) p1_conceded = parseInt(p.goalsconceded);
           });
        }
        if (m.match.players[clubIds[1]]) {
           Object.values(m.match.players[clubIds[1]]).forEach(p => {
               p2_goals += parseInt(p.goals||0);
               if (parseInt(p.goalsconceded||0) > p2_conceded) p2_conceded = parseInt(p.goalsconceded);
           });
        }
        console.log(`Club ${clubIds[0]} (${teams[0].name}) Human Goals: ${p1_goals}, Max Conceded: ${p1_conceded}`);
        console.log(`Club ${clubIds[1]} (${teams[1].name}) Human Goals: ${p2_goals}, Max Conceded: ${p2_conceded}`);
    }
  }

  await client.close();
}

run().catch(console.dir);
