import fs from 'fs';
import readline from 'readline';

async function main() {
    const fileStream = fs.createReadStream('C:\\Users\\Jose\\.gemini\\antigravity\\brain\\a7ea960c-5873-4b19-9081-2aa8b3e193f6\\.system_generated\\logs\\transcript.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const steps = [];
    for await (const line of rl) {
        try {
            steps.push(JSON.parse(line));
        } catch (e) {}
    }

    console.log(`Loaded ${steps.length} steps.`);
    
    // Find all USER_INPUT steps
    const userInputs = [];
    for (let i = 0; i < steps.length; i++) {
        if (steps[i].type === 'USER_INPUT' && steps[i].step_index < 7900) {
            userInputs.push({ index: i, step: steps[i] });
        }
    }

    console.log(`Found ${userInputs.length} user inputs.`);
    
    // Print the last 4 user inputs and their corresponding model responses
    const lastInputs = userInputs.slice(-4);
    for (const item of lastInputs) {
        console.log(`=========================================`);
        console.log(`USER STEP ${item.step.step_index} [${item.step.created_at}]:`);
        console.log(item.step.content);
        
        // Find the next model response
        let nextResponse = null;
        for (let j = item.index + 1; j < steps.length; j++) {
            if (steps[j].source === 'MODEL' && steps[j].type === 'PLANNER_RESPONSE') {
                // If it contains content, that's the explanation
                if (steps[j].content && steps[j].content.trim()) {
                    nextResponse = steps[j].content;
                    break;
                }
            }
            // Stop if we hit another user input
            if (steps[j].type === 'USER_INPUT') break;
        }
        
        if (nextResponse) {
            console.log(`--- MODEL RESPONSE ---`);
            console.log(nextResponse.substring(0, 1500));
        }
    }
}

main();
