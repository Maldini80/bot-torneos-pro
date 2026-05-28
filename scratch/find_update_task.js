import fs from 'fs';
import path from 'path';

const tasksDir = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks';

function main() {
    const files = fs.readdirSync(tasksDir);
    files.forEach(file => {
        const fullPath = path.join(tasksDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('update_rayden_points.js')) {
            console.log(`Found update_rayden_points in task file: ${file}`);
            console.log("File content:");
            console.log(content);
        }
    });
}

main();
