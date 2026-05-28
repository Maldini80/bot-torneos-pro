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
        if (!line.trim()) return;
        let parsed;
        try {
            parsed = JSON.parse(line);
        } catch (e) {
            return;
        }
        
        // Look for the model run_command step executing update_rayden_points.js
        if (parsed.type === 'RUN_COMMAND' && parsed.content && parsed.content.includes('update_rayden_points.js')) {
            console.log(`\n===========================================`);
            console.log(`Step ${parsed.step_index} execution output:`);
            console.log(parsed.content);
        }
    });
}

main();
