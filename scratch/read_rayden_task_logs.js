import fs from 'fs';
import path from 'path';

const tasksDir = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks';

function main() {
    const files = fs.readdirSync(tasksDir);
    files.forEach(file => {
        const fullPath = path.join(tasksDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.toLowerCase().includes('zzraydenzz')) {
            console.log(`\nFound Rayden in task file: ${file}`);
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                if (line.toLowerCase().includes('zzraydenzz')) {
                    console.log(`--- Line ${idx + 1} ---`);
                    for (let i = Math.max(0, idx - 4); i <= Math.min(lines.length - 1, idx + 4); i++) {
                        console.log(`  ${i + 1}: ${lines[i].trim()}`);
                    }
                }
            });
        }
    });
}

main();
