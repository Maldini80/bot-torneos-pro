import fs from 'fs';
import readline from 'readline';

const transcriptPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\logs\\transcript.jsonl';

async function main() {
    if (!fs.existsSync(transcriptPath)) {
        console.error("Transcript file not found.");
        return;
    }
    const fileStream = fs.createReadStream(transcriptPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let index = 0;
    for await (const line of rl) {
        index++;
        try {
            const data = JSON.parse(line);
            const content = data.content || '';
            const type = data.type || '';
            const source = data.source || '';
            
            // Look for user messages or model responses containing 100, 102, or traspasos
            const textToSearch = content.toLowerCase();
            if (textToSearch.includes('100') || textToSearch.includes('102') || textToSearch.includes('traspas') || textToSearch.includes('conflicto')) {
                console.log(`\n[Step ${data.step_index || index}] Source: ${source} | Type: ${type}`);
                console.log(content.substring(0, 1000));
                console.log('--------------------------------------------------');
            }
        } catch (e) {
            // Ignore JSON parse error
        }
    }
}

main();
