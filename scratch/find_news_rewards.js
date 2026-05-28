import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    console.log('=== BUSCANDO HISTORIAL DE RECOMPENSAS EN NOTICIAS ===\n');

    // 1. Obtener los equipos que tienen jugadores afectados
    const AFFECTED = ['Retromoneybeatz', 'nestor007', 'xDiiego10#6089', '13alvaro12', 'FrancM2P8', 'zzRaydenzz', 'not_ven00m'];
    const teamIds = [];
    const teamMap = new Map();

    for (const name of AFFECTED) {
        const escaped = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + escaped + '$', 'i') }
        }).toArray();

        for (const team of teams) {
            const teamIdStr = team._id.toString();
            if (!teamMap.has(teamIdStr)) {
                teamMap.set(teamIdStr, team);
                teamIds.push(team._id);
            }
        }
    }

    console.log(`Encontrados ${teamIds.length} equipos con jugadores afectados.`);

    // 2. Buscar las noticias de recompensa para estos equipos
    for (const teamIdStr of teamMap.keys()) {
        const team = teamMap.get(teamIdStr);
        const news = await db.collection('fantasy_news').find({
            leagueId: team.leagueId,
            type: 'reward',
            $or: [
                { message: { $regex: new RegExp(team.teamName, 'i') } },
                { 'metadata.teamName': team.teamName }
            ]
        }).sort({ createdAt: 1 }).toArray();

        console.log(`\n--------------------------------------------`);
        console.log(`Equipo: ${team.teamName} | LIGA ID: ${team.leagueId}`);
        console.log(`--------------------------------------------`);
        console.log(`Noticias de tipo 'reward' asociadas (${news.length}):`);
        
        for (const n of news) {
            const date = n.createdAt ? new Date(n.createdAt).toISOString() : 'N/A';
            console.log(`  [${date}] ${n.message}`);
        }
    }

    await client.close();
}

main().catch(console.error);
