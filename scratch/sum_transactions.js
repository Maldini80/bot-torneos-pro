const initialBudget = 150000000;
const transactions = [
    // Rewards
    4872000,
    15672000,
    // Sales
    12976500,
    10531500,
    6842500,
    7687500,
    7503000,
    // Fichajes
    -37100000,
    -13850000,
    -23100000,
    // Buyouts received
    19875000,
    15150000,
    9000000,
    // Buyouts paid
    -10575000,
    -19350000,
    -17775000,
    -10425000
];

const total = initialBudget + transactions.reduce((a, b) => a + b, 0);
console.log('Total non-pending balance:', total.toLocaleString('es-ES'), '€');
