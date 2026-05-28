import fs from 'fs';
import readline from 'readline';

async function run() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';
    
    if (!fs.existsSync(logPath)) {
        console.log(`Log file not found at: ${logPath}`);
        return;
    }
    
    console.log('Searching older logs (step_index < 4180) for "satita" or "satitajr"...');
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let count = 0;
    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.step_index < 4180) {
                const lineStr = JSON.stringify(data);
                if (lineStr.toLowerCase().includes('satita') || lineStr.toLowerCase().includes('satitajr')) {
                    console.log(`Match at step ${data.step_index}: ${lineStr.substring(0, 500)}...`);
                    count++;
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
    console.log(`\nFound ${count} matching older lines in logs.`);
}
run();
