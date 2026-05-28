import fs from 'fs';

try {
    const text = fs.readFileSync('scratch/starters_zero_points.txt', 'utf16le');
    const lines = text.split('\n');
    
    console.log('=== RESUMEN DE JUGADORES TITULARES A CERO ===\n');
    
    let teamCount = 0;
    const teamBlocks = [];
    let currentBlock = [];
    
    for (const line of lines) {
        if (line.startsWith('Equipo:')) {
            if (currentBlock.length > 0) {
                teamBlocks.push(currentBlock);
                currentBlock = [];
            }
            teamCount++;
        }
        if (line.trim() !== '') {
            currentBlock.push(line);
        }
    }
    if (currentBlock.length > 0) {
        teamBlocks.push(currentBlock);
    }
    
    console.log(`Total de equipos analizados con 11 titulares y algún jugador a cero: ${teamCount}\n`);
    
    console.log('--- DETALLE DE LOS PRIMEROS 8 EQUIPOS ---');
    teamBlocks.slice(0, 8).forEach(block => {
        block.forEach(l => console.log(l));
        console.log();
    });
    
    // Analyze most common zero-scoring players
    const zeroPlayersCount = {};
    for (const block of teamBlocks) {
        const zeroLine = block.find(l => l.includes('Titulares con 0 puntos:'));
        if (zeroLine) {
            const players = zeroLine.split('Titulares con 0 puntos:')[1].split(',');
            players.forEach(p => {
                const name = p.trim();
                if (name) {
                    zeroPlayersCount[name] = (zeroPlayersCount[name] || 0) + 1;
                }
            });
        }
    }
    
    console.log('--- JUGADORES TITULARES MÁS COMUNES CON 0 PUNTOS HOY (Y EN CUÁNTAS PLANTILLAS ESTÁN ALINEADOS) ---');
    const sortedZeroPlayers = Object.entries(zeroPlayersCount).sort((a, b) => b[1] - a[1]);
    sortedZeroPlayers.slice(0, 20).forEach(([name, count]) => {
        console.log(`- ${name}: alineado en ${count} once titular(es)`);
    });
    
} catch (e) {
    console.error(e.message);
}
