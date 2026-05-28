// scratch/read_logs.js
import fs from 'fs';
import readline from 'readline';

async function main() {
    const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';
    
    console.log(`Reading logs from: ${logPath}`);
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
            console.log(`Line ${lineNumber}:`);
            try {
                const parsed = JSON.parse(line);
                console.log(JSON.stringify(parsed, null, 2));
            } catch (e) {
                console.log(line);
            }
            console.log('\n----------------------------------------\n');
        }
    }
    
    console.log('Search finished.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
