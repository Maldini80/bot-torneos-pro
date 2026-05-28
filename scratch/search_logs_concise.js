// scratch/search_logs_concise.js
import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';
    
    if (!fs.existsSync(logPath)) {
        console.error('Log file does not exist!');
        process.exit(1);
    }
    
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let lineNumber = 0;
    for await (const line of rl) {
        lineNumber++;
        if (line.toLowerCase().includes('ciclo') || line.toLowerCase().includes('cicl')) {
            try {
                const parsed = JSON.parse(line);
                const source = parsed.source;
                const type = parsed.type;
                const content = parsed.content || '';
                
                // Show a short summary
                console.log(`[Line ${lineNumber}] Source: ${source} | Type: ${type}`);
                console.log(`Content snippet: ${content.substring(0, 300).replace(/\n/g, ' ')}...`);
                console.log('----------------------------------------');
            } catch (e) {
                console.log(`[Line ${lineNumber}] (Failed to parse JSON) snippet: ${line.substring(0, 300)}`);
            }
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
