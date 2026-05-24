import fetch from 'node-fetch';

async function main() {
    const url = 'https://www.virtualpronetwork.com/web/main.033f51c4195fdcb4.js';
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        console.log("Searching for how 's0' (action Load Team Roster) is handled in main.js:");
        
        // Find s0 usages. s0 is from module 97120 (actions).
        // Let's find occurrences of "s0" or "H0" followed by pipe or in a service/effect.
        // Wait, how about we search for ".xX" (since xX is exported as Cz or similar in 97120)?
        // Wait, in Match 6 of occurrences:
        // (0,i.on)(e.xX,(Z,{})=>({...Z,loadingTeam:!0,roster:{...Z.roster}}))
        // So e.xX is the action type. Let's search for "e.xX" or "e.Cz" or "e.KV" in main.js!
        
        const terms = ['e.xX', 'e.KV', 'e.H0', 'e.s0', 'e.p0'];
        for (const term of terms) {
            let idx = 0;
            let count = 0;
            while ((idx = text.indexOf(term, idx)) !== -1 && count < 10) {
                console.log(`\n--- Match for '${term}' at index ${idx} ---`);
                console.log(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 300)));
                idx += term.length;
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
