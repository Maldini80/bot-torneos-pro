import fs from 'fs';
import readline from 'readline';

async function run() {
    const filePath = 'scratch/resultado_simulacion.txt';
    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return;
    }
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let totalTeams = 0;
    let scoringTeams = 0;
    let zeroTeams = 0;
    
    for await (const line of rl) {
        if (line.includes('👉 Equipo:')) {
            totalTeams++;
            if (line.includes('-> 0 puntos hoy')) {
                zeroTeams++;
            } else {
                scoringTeams++;
            }
        }
    }
    
    console.log('=== ESTADÍSTICAS DE EQUIPOS EN LA SIMULACIÓN ===');
    console.log('Total de equipos analizados:', totalTeams);
    console.log('Equipos que sumaron puntos (> 0 pts):', scoringTeams);
    console.log('Equipos que sumaron 0 puntos:', zeroTeams);
}

run();
