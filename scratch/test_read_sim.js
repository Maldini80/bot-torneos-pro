import fs from 'fs';

const content = fs.readFileSync('scratch/resultado_simulacion.txt', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.toLowerCase().includes('zzraydenzz')) {
        console.log(`--- Line ${index + 1} ---`);
        for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
});
