import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const TEAM_NAMES = ["Perez FC", "V de Vendetta", "Downchester city", "MANQUIS"];

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== VERIFICANDO PUNTOS DE LOS EQUIPOS AFECTADOS POR RESETEOS ===\n');
        
        const todayStart = new Date("2026-05-27T00:00:00.000Z");
        
        for (const tName of TEAM_NAMES) {
            // Find rewards news today for this team name
            const news = await db.collection('fantasy_news').findOne({
                type: 'reward',
                message: { $regex: new RegExp(tName, 'i') },
                createdAt: { $gte: todayStart }
            });
            
            if (news) {
                console.log(`✅ Equipo: "${tName}"`);
                console.log(`   - Mensaje: ${news.message}`);
                console.log(`   - Fecha: ${new Date(news.createdAt).toLocaleString('es-ES')}`);
            } else {
                console.log(`❌ Equipo: "${tName}" -> No se encontró noticia de recompensas hoy (tal vez sumó 0 puntos).`);
            }
            
            // Print the current database points of this team
            const team = await db.collection('fantasy_teams').findOne({
                $or: [
                    { teamName: { $regex: new RegExp('^' + tName + '$', 'i') } },
                    { name: { $regex: new RegExp('^' + tName + '$', 'i') } }
                ]
            });
            if (team) {
                console.log(`   - Puntos acumulados en la DB actualmente: ${team.points} pts`);
                console.log(`   - Plantilla actual: ${team.players ? team.players.join(', ') : 'Ninguno'}`);
            }
            console.log('------------------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
