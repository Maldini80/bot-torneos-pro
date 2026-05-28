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
    
    const not11StartersTeams = [];
    const zeroPointsTeams = [];
    let currentLeague = '';
    
    for await (const line of rl) {
        if (line.startsWith('Liga Fantasy:') || line.startsWith('--- PROCESANDO LIGA')) {
            currentLeague = line.replace('----------------------------------------------------', '').trim();
        }
        if (line.includes('no tiene 11 titulares')) {
            // E.g. [VPG SYNC] El equipo X no tiene 11 titulares (Y/11).
            const match = line.match(/El equipo (.*?) no tiene 11 titulares \((.*?)\)/);
            if (match) {
                not11StartersTeams.push({
                    name: match[1],
                    starters: match[2],
                    league: currentLeague
                });
            }
        }
        if (line.includes('-> 0 puntos hoy')) {
            // E.g. 👉 Equipo: "CRISO FC" (Cristian Navarro González) -> 0 puntos hoy (ningún jugador activo sumó puntos).
            const match = line.match(/👉 Equipo: "(.*?)" \((.*?)\) -> 0 puntos hoy/);
            if (match) {
                zeroPointsTeams.push({
                    name: match[1],
                    manager: match[2],
                    league: currentLeague
                });
            }
        }
    }
    
    console.log('=== MOTIVOS DE 0 PUNTOS EN LA SIMULACIÓN ===\n');
    console.log(`--- 1. EQUIPOS SIN 11 TITULARES COMPLETOS (${not11StartersTeams.length} equipos) ---`);
    not11StartersTeams.forEach((t, i) => {
        console.log(`${i+1}. Equipo: "${t.name}" | Titulares: ${t.starters} | Liga: ${t.league}`);
    });
    
    console.log(`\n--- 2. EQUIPOS CON 11 TITULARES QUE NO SUMARON PUNTOS (${zeroPointsTeams.length} equipos) ---`);
    zeroPointsTeams.forEach((t, i) => {
        console.log(`${i+1}. Equipo: "${t.name}" | Mánager: ${t.manager} | Liga: ${t.league}`);
    });
}

run();
