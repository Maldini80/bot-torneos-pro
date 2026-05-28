import fs from 'fs';

const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks\\task-5004.log';

function run() {
    if (!fs.existsSync(logPath)) {
        console.log("Log file not found!");
        return;
    }
    const lines = fs.readFileSync(logPath, 'utf8').split('\n');
    console.log("=== Matching lines in log ===");
    lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('ivanovic') || line.toLowerCase().includes('raafagonzaa98')) {
            console.log(`${idx + 1}: ${line}`);
        }
    });
}
run();
