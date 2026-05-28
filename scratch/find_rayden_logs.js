import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b';

function walk(dir, results = []) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            walk(fullPath, results);
        } else {
            results.push(fullPath);
        }
    });
    return results;
}

function main() {
    console.log("Searching for old Rayden values in brain directory...");
    const files = walk(brainDir);
    let foundCount = 0;
    
    files.forEach(file => {
        if (file.endsWith('.json') || file.endsWith('.log') || file.endsWith('.txt') || file.endsWith('.jsonl') || file.endsWith('.md')) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                if (content.toLowerCase().includes('zzraydenzz') && content.includes('basePoint')) {
                    console.log(`\nFound match in file: ${file}`);
                    const lines = content.split('\n');
                    lines.forEach((line, idx) => {
                        if (line.toLowerCase().includes('zzraydenzz') || line.toLowerCase().includes('basepoint')) {
                            if (line.length < 500) { // skip very long lines
                                console.log(`  Line ${idx + 1}: ${line.trim()}`);
                            } else {
                                console.log(`  Line ${idx + 1}: [Long line containing match]`);
                            }
                        }
                    });
                    foundCount++;
                }
            } catch (e) {
                // ignore
            }
        }
    });
    console.log(`\nSearch finished. Found matches in ${foundCount} files.`);
}

main();
