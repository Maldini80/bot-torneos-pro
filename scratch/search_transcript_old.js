// scratch/search_transcript_old.js
import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\0a7e5c6b-92ec-407f-92b4-e44733f7a181\\.system_generated\\logs\\transcript.jsonl';
    
    console.log(`Reading old transcript entries...`);
    
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.step_index < 7500) {
                const content = data.content || '';
                const type = data.type || '';
                
                if (content.toLowerCase().includes('desconex') || content.toLowerCase().includes('dnf') || content.toLowerCase().includes('puntos') || content.toLowerCase().includes('crawler')) {
                    if (data.source === 'USER_EXPLICIT' || data.source === 'MODEL') {
                        console.log(`[Step ${data.step_index}] ${data.source} (${type}):`);
                        console.log(content.substring(0, 300));
                        console.log('--------------------------------------------------');
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }
}

main();
