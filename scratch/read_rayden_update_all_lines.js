import fs from 'fs';
import path from 'path';

const transcriptPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';

function main() {
    if (!fs.existsSync(transcriptPath)) {
        console.error("Transcript file not found.");
        return;
    }
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('update_rayden_points')) {
            console.log(`\nLine ${idx+1}:`);
            console.log(line.substring(0, 3000));
        }
    });
}

main();
