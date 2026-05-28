import 'dotenv/config';

const initialBudget = 150000000;

const deductions = [
    { name: 'bid_placed:BIL_0028', amount: -16450000 },
    { name: 'bid_placed:alegrima', amount: -6800000 },
    { name: 'bid_placed:KTDNrubo', amount: -13050000 },
    { name: 'bid_placed:TWNUTOSSS', amount: -37100000 },
    { name: 'bid_placed:A1maarr5', amount: -7650000 },
    { name: 'bid_placed:Fernando_im', amount: -18500000 },
    { name: 'bid_placed:Vargas7_x', amount: -29450000 },
    { name: 'bid_placed:MJB03', amount: -52000000 },
    { name: 'bid_placed:supergigio78', amount: -13850000 },
    { name: 'bid_placed:elkrakenn23_', amount: -12600000 },
    { name: 'buyout_paid:rraay', amount: -10575000 },
    { name: 'buyout_paid:elkrakenn23_', amount: -19350000 },
    { name: 'bid_placed:Edupb02', amount: -23100000 },
    { name: 'bid_placed:sergio_rodeee', amount: -14000000 },
    { name: 'bid_placed:israeadri', amount: -28000000 },
    { name: 'buyout_paid:gonxi88', amount: -17775000 },
    { name: 'buyout_paid:iSekinha', amount: -10425000 },
    { name: 'bid_placed:elbrokoo30', amount: -65000000 },
    { name: 'bid_placed:VZskyzze', amount: -13150001 },
    { name: 'bid_placed:antooMLG', amount: -13300000 }
];

const credits = [
    { name: 'refund:BIL_0028', amount: 16450000 },
    { name: 'refund:A1maarr5', amount: 7650000 },
    { name: 'refund:Fernando_im', amount: 18500000 },
    { name: 'refund:Vargas7_x', amount: 29450000 },
    { name: 'refund:MJB03', amount: 52000000 },
    { name: 'refund:elkrakenn23_', amount: 12600000 },
    { name: 'refund:sergio_rodeee', amount: 14000000 },
    { name: 'refund:israeadri', amount: 28000000 },
    { name: 'refund:elbrokoo30', amount: 65000000 },
    { name: 'sale:Alecastillo', amount: 12976500 },
    { name: 'sale:manucandon_99', amount: 10531500 },
    { name: 'sale:UNNAIIX', amount: 6842500 },
    { name: 'sale:MaTuDarheL', amount: 7687500 },
    { name: 'sale:jesusgp200122', amount: 7503000 },
    { name: 'reward:May27', amount: 4872000 },
    { name: 'reward:May28', amount: 15672000 },
    { name: 'buyout_received:KTDNrubo', amount: 19875000 },
    { name: 'buyout_received:alegrima', amount: 15150000 },
    { name: 'buyout_received:GERIGF111', amount: 9000000 }
];

const targetBalance = -528002;
const tolerance = 100000; // 100k tolerance

async function main() {
    let baseSum = initialBudget;
    for (const d of deductions) {
        baseSum += d.amount;
    }
    
    const n = credits.length;
    const matches = [];
    
    for (let i = 0; i < (1 << n); i++) {
        let creditSum = 0;
        for (let j = 0; j < n; j++) {
            if ((i & (1 << j)) !== 0) {
                creditSum += credits[j].amount;
            }
        }
        
        const finalCalculated = baseSum + creditSum;
        const diff = Math.abs(finalCalculated - targetBalance);
        
        if (diff <= tolerance) {
            const appliedCredits = [];
            const failedCredits = [];
            for (let j = 0; j < n; j++) {
                if ((i & (1 << j)) !== 0) {
                    appliedCredits.push(credits[j]);
                } else {
                    failedCredits.push(credits[j]);
                }
            }
            matches.push({
                diff,
                calculated: finalCalculated,
                appliedCredits,
                failedCredits
            });
        }
    }
    
    // Sort matches by absolute difference
    matches.sort((a, b) => a.diff - b.diff);
    
    console.log(`Found ${matches.length} matches within ${tolerance.toLocaleString()} € tolerance:`);
    for (let idx = 0; idx < Math.min(5, matches.length); idx++) {
        const m = matches[idx];
        console.log(`\n--- Match #${idx + 1} (Difference: ${m.diff.toLocaleString()} €) ---`);
        console.log(`Calculated Balance: ${m.calculated.toLocaleString()} € vs DB Balance: ${targetBalance.toLocaleString()} €`);
        console.log(`Applied Credits:\n  - ${m.appliedCredits.map(c => `${c.name} (${c.amount.toLocaleString()} €)`).join('\n  - ')}`);
        console.log(`FAILED Credits:\n  - ${m.failedCredits.map(c => `${c.name} (${c.amount.toLocaleString()} €)`).join('\n  - ')}`);
    }
}

main();
