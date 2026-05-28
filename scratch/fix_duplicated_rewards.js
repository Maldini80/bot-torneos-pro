import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();

    const corrections = [
        { name: "jotaeme", points: 922.0, balance: 73760000 },
        { name: "Rulineta FC", points: 672.5, balance: 53800000 },
        { name: "Avanti noutestriste", points: 827.7, balance: 66216000 },
        { name: "Visca Team", points: 1321.6, balance: 105728000 },
        { name: "Eduars", points: 949.3, balance: 75944000 },
        { name: "Bastard Munchen", points: 796.7, balance: 63736000 },
        { name: "morosNO", points: 965.7, balance: 77256000 },
        { name: "At cordobes", points: 1221.5, balance: 97720000 }
    ];

    console.log("Applying point and balance corrections to fantasy teams...");

    for (const corr of corrections) {
        const team = await db.collection('fantasy_teams').findOne({ 
            teamName: corr.name, 
            leagueId: "6a13177edc64209e81f2df1c" 
        });

        if (team) {
            console.log(`Team: ${corr.name}`);
            console.log(`  Before -> Points: ${team.points}, Balance: ${team.balance}`);
            
            const newPoints = Math.round((team.points - corr.points) * 10) / 10;
            const newBalance = team.balance - corr.balance;

            await db.collection('fantasy_teams').updateOne(
                { _id: team._id },
                { 
                    $set: { 
                        points: newPoints,
                        balance: newBalance
                    } 
                }
            );

            console.log(`  After  -> Points: ${newPoints}, Balance: ${newBalance}`);
        } else {
            console.error(`Could not find team "${corr.name}" in league "6a13177edc64209e81f2df1c"`);
        }
    }

    console.log("\nCorrections completed successfully!");
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
