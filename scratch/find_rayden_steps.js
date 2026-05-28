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
        
        let parsed = null;
        try {
            parsed = JSON.parse(line);
        } catch (e) {
            return;
        }
        
        const stringified = JSON.stringify(parsed);
        const lower = stringified.toLowerCase();
        
        if (lower.includes('zzraydenzz')) {
            console.log(`\n===========================================`);
            console.log(`Step Index: ${parsed.step_index} | Type: ${parsed.type}`);
            
            // Print a summarized version of the content
            if (parsed.content) {
                const subContent = parsed.content.substring(0, 300);
                console.log(`Content snippet: ${subContent}...`);
            }
            if (parsed.tool_calls) {
                console.log(`Tool Calls: ${JSON.stringify(parsed.tool_calls).substring(0, 300)}...`);
            }
            // If the step has command output or similar
            if (parsed.output) {
                console.log(`Output snippet: ${parsed.output.substring(0, 500)}...`);
            }
        }
    });
}

main();
