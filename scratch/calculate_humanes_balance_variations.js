import 'dotenv/config';

// All transactions in chronological order (including bids placed)
// If a bid is placed, it is ALWAYS subtracted (negative).
// If a bid is rejected, it should be refunded (positive).
// Buyouts paid are negative.
// Buyouts received are positive.
// Rewards and sales are positive.

const initialBudget = 150000000;

// Hardcoded transactions that always happened (sales, rewards, accepted bids, buyouts paid/received)
// Let's model each transaction as an object. Bids placed are separate from refunds.
const fixedEvents = [
    // Bids placed (must be deducted)
    { name: 'bid_placed:BIL_0028', amount: -16450000 },
    { name: 'bid_placed:alegrima', amount: -6800000 },
    { name: 'bid_placed:KTDNrubo', amount: -13050000 },
    
    // Sales and rewards
    { name: 'sale:Alecastillo', amount: 12976500 },
    
    // Bids placed
    { name: 'bid_placed:TWNUTOSSS', amount: -37100000 },
    { name: 'bid_placed:A1maarr5', amount: -7650000 },
    { name: 'bid_placed:Fernando_im', amount: -18500000 },
    
    // Bids placed
    { name: 'bid_placed:Vargas7_x', amount: -29450000 },
    { name: 'bid_placed:MJB03', amount: -52000000 },
    { name: 'bid_placed:supergigio78', amount: -13850000 },
    
    // Buyouts received (steals from HUMANES)
    { name: 'buyout_received:KTDNrubo', amount: 19875000 },
    
    // Bids placed
    { name: 'bid_placed:elkrakenn23_', amount: -12600000 },
    
    // Buyouts received (steals from HUMANES)
    { name: 'buyout_received:alegrima', amount: 15150000 },
    
    // Reward
    { name: 'reward:May27', amount: 4872000 },
    
    // Buyouts paid (steals by HUMANES)
    { name: 'buyout_paid:rraay', amount: -10575000 },
    { name: 'buyout_paid:elkrakenn23_', amount: -19350000 },
    
    // Bids placed
    { name: 'bid_placed:Edupb02', amount: -23100000 },
    
    // Buyout received (steal from HUMANES)
    { name: 'buyout_received:GERIGF111', amount: 9000000 },
    
    // Bids placed today/yesterday
    { name: 'bid_placed:sergio_rodeee', amount: -14000000 },
    
    // Sales
    { name: 'sale:manucandon_99', amount: 10531500 },
    { name: 'sale:UNNAIIX', amount: 6842500 },
    { name: 'sale:MaTuDarheL', amount: 7687500 },
    { name: 'sale:jesusgp200122', amount: 7503000 },
    
    // Bid placed
    { name: 'bid_placed:israeadri', amount: -28000000 },
    
    // Reward
    { name: 'reward:May28', amount: 15672000 },
    
    // Buyouts paid
    { name: 'buyout_paid:gonxi88', amount: -17775000 },
    { name: 'buyout_paid:iSekinha', amount: -10425000 },
    
    // Bid placed
    { name: 'bid_placed:elbrokoo30', amount: -65000000 },
    
    // Bids placed after market resolution today
    { name: 'bid_placed:VZskyzze', amount: -13150001 },
    { name: 'bid_placed:antooMLG', amount: -13300000 }
];

// Optional refunds for rejected bids (we want to check which ones might have failed)
const optionalRefunds = [
    { name: 'refund:BIL_0028', amount: 16450000 },
    { name: 'refund:A1maarr5', amount: 7650000 },
    { name: 'refund:Fernando_im', amount: 18500000 },
    { name: 'refund:Vargas7_x', amount: 29450000 },
    { name: 'refund:MJB03', amount: 52000000 },
    { name: 'refund:elkrakenn23_', amount: 12600000 },
    { name: 'refund:sergio_rodeee', amount: 14000000 },
    { name: 'refund:israeadri', amount: 28000000 },
    { name: 'refund:elbrokoo30', amount: 65000000 }
];

// Target database balance
const targetBalance = -528002;

// Let's run a search. We have 9 optional refunds, which means 2^9 = 512 combinations.
// We can also allow one of the buyouts received to have failed (since they are large and might not have been credited).
const buyoutsReceived = [
    { name: 'buyout_received:KTDNrubo', amount: 19875000 },
    { name: 'buyout_received:alegrima', amount: 15150000 },
    { name: 'buyout_received:GERIGF111', amount: 9000000 }
];

async function main() {
    let baseSum = initialBudget;
    for (const e of fixedEvents) {
        baseSum += e.amount;
    }
    
    console.log(`Base sum with all deductions and fixed credits (excluding refunds): ${baseSum.toLocaleString('es-ES')} €`);
    
    const n = optionalRefunds.length;
    let found = false;
    
    for (let i = 0; i < (1 << n); i++) {
        // Evaluate combination of refunds
        let refundSum = 0;
        const appliedRefunds = [];
        const missingRefunds = [];
        
        for (let j = 0; j < n; j++) {
            if ((i & (1 << j)) !== 0) {
                refundSum += optionalRefunds[j].amount;
                appliedRefunds.push(optionalRefunds[j].name);
            } else {
                missingRefunds.push(optionalRefunds[j].name);
            }
        }
        
        // Try combinations of whether the buyouts received were actually credited or not
        // We can do another bitmask for the 3 received buyouts (8 combinations)
        for (let k = 0; k < 8; k++) {
            let buyoutAdjustment = 0;
            const failedBuyouts = [];
            
            for (let l = 0; l < 3; l++) {
                if ((k & (1 << l)) !== 0) {
                    // This buyout failed to credit, so we subtract its amount from baseSum
                    buyoutAdjustment -= buyoutsReceived[l].amount;
                    failedBuyouts.push(buyoutsReceived[l].name);
                }
            }
            
            const finalCalculated = baseSum + refundSum + buyoutAdjustment;
            
            if (finalCalculated === targetBalance) {
                found = true;
                console.log('\n================ MATCH FOUND! ================');
                console.log(`Initial Budget: ${initialBudget.toLocaleString('es-ES')} €`);
                console.log(`Applied Refunds:\n  - ${appliedRefunds.join('\n  - ')}`);
                console.log(`FAILED Refunds (Money lost):\n  - ${missingRefunds.join('\n  - ')}`);
                console.log(`FAILED Buyout Credits (Money lost):\n  - ${failedBuyouts.length > 0 ? failedBuyouts.join('\n  - ') : 'None'}`);
                console.log(`Result: ${finalCalculated.toLocaleString('es-ES')} € (Matches DB Balance: ${targetBalance.toLocaleString('es-ES')} €)`);
            }
        }
    }
    
    if (!found) {
        console.log('\nNo exact match found with standard transactions. Let\'s check with 100M initial budget...');
        
        const baseSum100 = baseSum - 50000000;
        for (let i = 0; i < (1 << n); i++) {
            let refundSum = 0;
            const appliedRefunds = [];
            const missingRefunds = [];
            
            for (let j = 0; j < n; j++) {
                if ((i & (1 << j)) !== 0) {
                    refundSum += optionalRefunds[j].amount;
                    appliedRefunds.push(optionalRefunds[j].name);
                } else {
                    missingRefunds.push(optionalRefunds[j].name);
                }
            }
            
            for (let k = 0; k < 8; k++) {
                let buyoutAdjustment = 0;
                const failedBuyouts = [];
                
                for (let l = 0; l < 3; l++) {
                    if ((k & (1 << l)) !== 0) {
                        buyoutAdjustment -= buyoutsReceived[l].amount;
                        failedBuyouts.push(buyoutsReceived[l].name);
                    }
                }
                
                const finalCalculated = baseSum100 + refundSum + buyoutAdjustment;
                
                if (finalCalculated === targetBalance) {
                    found = true;
                    console.log('\n================ MATCH FOUND (100M Initial budget)! ================');
                    console.log(`Applied Refunds:\n  - ${appliedRefunds.join('\n  - ')}`);
                    console.log(`FAILED Refunds (Money lost):\n  - ${missingRefunds.join('\n  - ')}`);
                    console.log(`FAILED Buyout Credits (Money lost):\n  - ${failedBuyouts.length > 0 ? failedBuyouts.join('\n  - ') : 'None'}`);
                    console.log(`Result: ${finalCalculated.toLocaleString('es-ES')} € (Matches DB Balance: ${targetBalance.toLocaleString('es-ES')} €)`);
                }
            }
        }
    }
    
    if (!found) {
        console.log('\nNo match found.');
    }
}

main();
