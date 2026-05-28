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
    let found = false;
    
    lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('base points saved in league') || line.toLowerCase().includes('calculated delta:')) {
            console.log(`\nLine ${idx+1}:`);
            console.log(line.substring(0, 2000));
            found = true;
        }
    });
    
    if (!found) {
        console.log("No occurrences of 'Base Points saved in league' or 'Calculated Delta:' found in transcript.");
    }
}

main();
