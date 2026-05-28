import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== DETALLE DE PUNTOS DE TSX-Juanri2 EN TODAS LAS LIGAS ===\n');
        
        const playerName = 'TSX-Juanri2';
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: playerName });
        if (!player) {
            console.log('No se encontró al jugador.');
            return;
        }
        
        console.log(`Puntos VPG oficiales en su ficha: ${player.stats?.vpgPoints} pts`);
        console.log('----------------------------------------------------');
        
        const teams = await db.collection('fantasy_teams').find({ players: playerName }).toArray();
        
        for (const t of teams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(t.leagueId) });
            if (!league) continue;
            
            const basePoints = league.basePoints || {};
            const matchKey = Object.keys(basePoints).find(k => k.toLowerCase() === playerName.toLowerCase());
            const baseVal = matchKey ? basePoints[matchKey] : undefined;
            
            let leaguePoints = player.stats.vpgPoints; // Si no es zero, son los puntos completos
            if (league.pointsMode === 'zero') {
                if (baseVal !== undefined) {
                    leaguePoints = Math.max(0, Math.round((player.stats.vpgPoints - baseVal) * 10) / 10);
                } else {
                    leaguePoints = 0; // Si no hay basePoints definidos aún
                }
            }
            
            console.log(`Liga: "${league.name}" (pointsMode: ${league.pointsMode})`);
            console.log(`- Equipo: "${t.teamName}" (Mánager: ${t.discordUsername})`);
            console.log(`- BasePoints de Liga: ${baseVal !== undefined ? baseVal : 'No definido'}`);
            console.log(`- Puntos Calculados en esta liga: **${leaguePoints}** pts`);
            console.log('----------------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
