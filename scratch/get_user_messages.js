// scratch/get_user_messages.js
import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\0a7e5c6b-92ec-407f-92b4-e44733f7a181\\.system_generated\\logs\\transcript.jsonl';
    const rl = readline.createInterface({
        input: fs.createReadStream(logPath),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.source === 'USER_EXPLICIT') {
                const content = data.content || '';
                // Only print if contains keywords we want
                if (content.toLowerCase().includes('desconex') || content.toLowerCase().includes('dnf') || content.toLowerCase().includes('puntos') || content.toLowerCase().includes('crawler') || content.toLowerCase().includes('partido') || content.toLowerCase().includes('medio') || content.toLowerCase().includes('precio')) {
                    console.log(`[Step ${data.step_index}] USER: ${content}`);
                    console.log('---');
                }
            }
        } catch (e) {}
    }
}

main();
