import fs from 'fs';

const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks\\task-5231.log';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log("Teams that gained points in task-5231:");
lines.forEach((line) => {
    if (line.includes('[VPG SYNC] El equipo')) {
        console.log(line.trim());
    }
});
