// scratch/get_desconex_context.js
import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\0a7e5c6b-92ec-407f-92b4-e44733f7a181\\.system_generated\\logs\\transcript.jsonl';
    const rl = readline.createInterface({
        input: fs.createReadStream(logPath),
        crlfDelay: Infinity
    });

    let matches = [];
    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            const content = data.content || '';
            if (content.toLowerCase().includes('desconex') || content.toLowerCase().includes('dnf')) {
                matches.push({
                    step: data.step_index,
                    source: data.source,
                    type: data.type,
                    content: content
                });
            }
        } catch (e) {}
    }

    console.log(`Found ${matches.length} matches:`);
    matches.forEach(m => {
        console.log(`[Step ${m.step}] ${m.source} (${m.type}):`);
        console.log(m.content);
        console.log('==================================================\n');
    });
}

main();
