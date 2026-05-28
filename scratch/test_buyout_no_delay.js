import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

async function run() {
    console.log('=== INICIANDO PRUEBA DE CLAUSULAZO SIN RETRASO ===\n');

    // 1. Verificar la sintaxis de visualizerServer.js
    console.log('1. Verificando sintaxis de visualizerServer.js...');
    try {
        execSync('node -c visualizerServer.js', { stdio: 'inherit' });
        console.log('✅ Sintaxis de visualizerServer.js correcta.');
    } catch (err) {
        console.error('❌ Error de sintaxis en visualizerServer.js:', err.message);
        process.exit(1);
    }

    // 2. Leer la línea exacta modificada en visualizerServer.js para asegurar el cambio
    console.log('\n2. Inspeccionando la línea modificada en el código...');
    const filePath = path.resolve('visualizerServer.js');
    const content = readFileSync(filePath, 'utf-8');
    
    const targetLine = 'const shouldDelayPoints = false;';
    if (content.includes(targetLine)) {
        console.log('✅ La línea modificada se encuentra en el archivo:');
        const lines = content.split('\n');
        const matchIdx = lines.findIndex(line => line.includes(targetLine));
        if (matchIdx !== -1) {
            console.log(`   Línea ${matchIdx + 1}: ${lines[matchIdx].trim()}`);
            console.log(`   Línea anterior: ${lines[matchIdx - 1]?.trim()}`);
            console.log(`   Línea siguiente: ${lines[matchIdx + 1]?.trim()}`);
        }
    } else {
        console.error('❌ ERROR: No se encontró la línea modificada "const shouldDelayPoints = false;" en visualizerServer.js.');
        process.exit(1);
    }

    console.log('\n✅ Prueba completada con éxito.');
}

run();
