import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== INVESTIGACIÓN BASEPOINTS DE TSX-Juanri2 ===\n');
        
        const qdmLeagueId = '6a1165ac92863afdcad3676f';
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: 'TSX-Juanri2' });
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(qdmLeagueId) });
        
        if (!player || !league) {
            console.log('No se encontró al jugador o a la liga.');
            return;
        }
        
        console.log(`Jugador: ${player.eaPlayerName}`);
        console.log(`Puntos VPG en su perfil: ${player.stats?.vpgPoints}`);
        
        // Buscar en los basePoints de la liga QDM
        const basePoints = league.basePoints || {};
        
        // Buscar coincidencia insensible a mayúsculas
        const matchKey = Object.keys(basePoints).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
        const baseVal = matchKey ? basePoints[matchKey] : undefined;
        
        console.log(`\nBasePoints en la liga Qdm esports para este jugador: ${baseVal !== undefined ? baseVal : 'NO DEFINIDO'}`);
        
        if (baseVal !== undefined) {
            const calculatedPoints = Math.max(0, Math.round((player.stats.vpgPoints - baseVal) * 10) / 10);
            console.log(`Puntos calculados en esta liga: ${player.stats.vpgPoints} - ${baseVal} = ${calculatedPoints} pts`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
