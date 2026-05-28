import fs from 'fs';
import path from 'path';

const transcriptPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';

function main() {
    if (!fs.existsSync(transcriptPath)) {
        console.error("Transcript file not found.");
        return;
    }
    
    // Read line-by-line using a read stream or splitting
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
        
        // We want steps where zzraydenzz was found in the tool output or content
        if (lower.includes('zzraydenzz') && (lower.includes('basepoint') || lower.includes('base_points') || lower.includes('check_rayden'))) {
            // Check if this step contains output of a command or query
            console.log(`\n===========================================`);
            console.log(`Step Index: ${parsed.step_index} | Type: ${parsed.type}`);
            
            // Print a summarized version of the content/tool_calls/tool_response
            if (parsed.content && parsed.content.length < 5000) {
                console.log("Content:");
                console.log(parsed.content);
            }
            if (parsed.tool_calls) {
                console.log("Tool Calls:");
                console.log(JSON.stringify(parsed.tool_calls, null, 2));
            }
            // If there's tool response or output in the step, print it
            if (parsed.output && parsed.output.length < 5000) {
                console.log("Output:");
                console.log(parsed.output);
            }
            // Let's search inside the text for specific matches
            const matches = parsed.content ? parsed.content.match(/.{0,100}zzraydenzz.{0,100}/gi) : null;
            if (matches) {
                console.log("Sub-matches in content:");
                matches.forEach(m => console.log(` - ${m.trim()}`));
            }
        }
    });
}

main();
