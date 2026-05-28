// scratch/print_line_range.js
import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';
    
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let lineNumber = 0;
    for await (const line of rl) {
        lineNumber++;
        if (lineNumber >= 7970 && lineNumber <= 7998) {
            console.log(`\n=================== LINE ${lineNumber} ===================`);
            try {
                const parsed = JSON.parse(line);
                console.log(`Source: ${parsed.source} | Type: ${parsed.type}`);
                console.log(`Content:\n${parsed.content}`);
            } catch (e) {
                console.log(line);
            }
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
