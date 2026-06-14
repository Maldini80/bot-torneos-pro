import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\c75d8500-48bd-41a9-bd8c-8dac79b79b29\\.system_generated\\logs\\transcript.jsonl';
    console.log(`Reading logs from: ${logPath}`);
    
    if (!fs.existsSync(logPath)) {
        console.log("Log file does not exist.");
        process.exit(0);
    }
    
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let userMsgIndex = 0;
    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.type === 'USER_INPUT') {
                userMsgIndex++;
                if (userMsgIndex <= 15) { // Print first 15 messages
                    console.log(`\n=== User Message #${userMsgIndex} ===`);
                    console.log(data.content);
                }
            }
        } catch (e) {
            // ignore malformed lines
        }
    }
    
    process.exit(0);
}

main();
