import fs from 'fs';
import path from 'path';

const logsDir = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks';

function run() {
    console.log(`Searching for old stats of raafagonza in logs...`);
    const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
    
    // Sort files by creation time to see oldest first or newest first
    files.sort((a, b) => fs.statSync(path.join(logsDir, a)).mtime - fs.statSync(path.join(logsDir, b)).mtime);
    
    for (const file of files) {
        const filePath = path.join(logsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (content.toLowerCase().includes('raafagonzaa98')) {
            const lines = content.split('\n');
            const matchingLines = lines.filter(line => line.includes('raafagonzaa98') || line.includes('raafagonzaa98'.toLowerCase()));
            if (matchingLines.length > 0) {
                console.log(`\nFile: ${file} (Modified: ${fs.statSync(filePath).mtime.toISOString()}):`);
                matchingLines.slice(0, 10).forEach(l => console.log(`  > ${l.trim()}`));
            }
        }
    }
}

run();
