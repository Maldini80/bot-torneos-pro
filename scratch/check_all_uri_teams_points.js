import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const teamIds = [
        '6a11050481beb9b56df55c1a',
        '6a1108c881beb9b56df55c20',
        '6a12d5d1956c0f43c400ecae'
    ];

    // Leer el log de la última simulación
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks\\task-10140.log';
    let logContent = '';
    try {
        logContent = fs.readFileSync(logPath, 'utf8');
    } catch (e) {
        console.error('No se pudo leer el archivo de log:', e.message);
    }

    for (const tid of teamIds) {
        const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(tid) });
        if (!team) {
            console.log(`No se encontró el equipo con ID ${tid}`);
            continue;
        }

        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
        console.log(`\n================ EQUIPO: "${team.teamName}" (Liga: "${league?.name || 'Desconocida'}") ================`);
        console.log(`Titulares en Lineup: ${JSON.stringify(team.lineup)}`);
        console.log(`Plantilla completa: ${team.players.join(', ')}`);

        // Buscar en los logs de la simulación la sección de este equipo
        console.log('\nResultados en la Simulación:');
        const lines = logContent.split('\n');
        let foundLines = [];
        for (const line of lines) {
            if (line.includes(tid)) {
                foundLines.push(line);
            }
        }

        // También buscar los logs de inserción de historial para sus jugadores
        for (const player of team.players) {
            const playerRegex = new RegExp(`"playerName":"${player.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}"` + '.*' + tid, 'i');
            for (const line of lines) {
                if (playerRegex.test(line)) {
                    console.log(`  - ${line.trim()}`);
                }
            }
        }

        // Buscar recompensa
        const rewardRegex = new RegExp(`El equipo ${team.teamName} ha ganado`, 'i');
        for (const line of lines) {
            if (rewardRegex.test(line) && line.includes(team.teamName)) {
                console.log(`  -> ${line.trim()}`);
            }
        }
    }

    await client.close();
}
main().catch(console.error);
