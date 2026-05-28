import fs from 'fs';

async function main() {
    const simText = fs.readFileSync('scratch/resultado_simulacion.txt', 'utf-8');
    const playerDeltas = new Map();
    
    const lines = simText.split('\n');
    
    for (const line of lines) {
        // 1. Global list lines:
        // "5. Adrianbr03 (RYSIX GAMING): anterior: 224.6 pts -> actual: 361.6 pts (Delta: +137 pts)"
        const matchGlobal = line.match(/^\d+\.\s+(.*?)\s+\([^)]+\):\s+anterior:\s+[\d.]+\s+pts\s+-\u003e\s+actual:\s+[\d.]+\s+pts\s+\(Delta:\s+\+([\d.]+)\s+pts\)/i);
        if (matchGlobal) {
            const name = matchGlobal[1].toLowerCase().trim();
            const delta = parseFloat(matchGlobal[2]);
            playerDeltas.set(name, delta);
        }
        
        // 2. Contribution lines:
        // "   Jugadores que aportaron: quiquejr78 (+15.1 pts), guto_12_ (+37.6 pts), Raul Pro (+26.6 pts)"
        if (line.includes('Jugadores que aportaron:')) {
            const content = line.split('Jugadores que aportaron:')[1].trim();
            const parts = content.split(',');
            for (const part of parts) {
                const subParts = part.split('(');
                if (subParts.length >= 2) {
                    const name = subParts[0].trim().toLowerCase();
                    const deltaMatch = subParts[1].match(/\+([\d.]+)\s+pts/);
                    if (deltaMatch) {
                        const delta = parseFloat(deltaMatch[1]);
                        if (!playerDeltas.has(name) || playerDeltas.get(name) < delta) {
                            playerDeltas.set(name, delta);
                        }
                    }
                }
            }
        }
    }
    
    console.log(`Parsed ${playerDeltas.size} unique players with points delta.`);
    console.log('Sample parsed players (including those with spaces):');
    let count = 0;
    for (const [name, delta] of playerDeltas.entries()) {
        if (name.includes(' ')) {
            count++;
            if (count <= 20) {
                console.log(`- "${name}": +${delta} pts`);
            }
        }
    }
}

main().catch(console.error);
