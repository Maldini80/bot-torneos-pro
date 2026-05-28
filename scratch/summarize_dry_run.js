import fs from 'fs';

const content = fs.readFileSync('scratch/dry_run_output.txt', 'utf16le');
console.log('=== PARSED DRY RUN SUMMARY ===\n');

const lines = content.split('\n');
let activeJugador = null;

for (const line of lines) {
    if (line.includes('👤 Jugador:')) {
        activeJugador = line.trim();
        console.log(`\n${activeJugador}`);
    }
    
    // Print summary lines
    if (line.includes('Puntos DB') || line.includes('Nuevos Puntos') || line.includes('Reset VPG')) {
        console.log(line.trim());
    }
    
    // Print decisions that are updates, and a sample of keeps
    if (line.includes('Decision: UPDATE')) {
        console.log(`  [UPDATE] ${line.trim()}`);
    } else if (line.includes('RUDOS CD') || line.includes('2 DIVISION VPG') || line.includes('Liga MAGIC') || line.includes('Vike Calvo')) {
        if (line.trim().startsWith('*')) {
            console.log(`  [SPECIAL] ${line.trim()}`);
        }
    }
}
