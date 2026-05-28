import fs from 'fs';
import readline from 'readline';

async function run() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';
    
    console.log('Searching user messages in transcript.jsonl...');

    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let index = 0;
    for await (const line of rl) {
        const step = JSON.parse(line);
        if (step.source === 'USER_EXPLICIT' && step.type === 'USER_INPUT') {
            console.log(`\n[User Msg ${index}] Timestamp: ${step.created_at}`);
            console.log(step.content);
        }
        index++;
    }
}

run().catch(console.error);
