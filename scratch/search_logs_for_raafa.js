import fs from 'fs';
import path from 'path';

const logsDir = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks';

function run() {
    console.log(`Searching for "raafagonza" in directory: ${logsDir}`);
    
    if (!fs.existsSync(logsDir)) {
        console.error("Directory does not exist!");
        return;
    }
    
    const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
    console.log(`Found ${files.length} log files to search.`);
    
    let matchCount = 0;
    for (const file of files) {
        const filePath = path.join(logsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (content.toLowerCase().includes('raafagonza')) {
            console.log(`\n=== MATCH FOUND IN FILE: ${file} ===`);
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                if (line.toLowerCase().includes('raafagonza')) {
                    console.log(`Line ${idx + 1}: ${line.trim()}`);
                    matchCount++;
                }
            });
        }
    }
    
    console.log(`\nFinished search. Found ${matchCount} matches.`);
}

run();
