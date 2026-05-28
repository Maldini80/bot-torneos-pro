import fs from 'fs';

const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks\\task-5231.log';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log("Mentions of daniveera in sync log:");
lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('daniveera')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});
