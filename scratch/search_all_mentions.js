import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const defaultDb = getDb();
    const testDb = getDb('test');

    console.log('=== SEARCH FOR RYSIX IN DEFAULT DB ===');
    const colsDefault = await defaultDb.listCollections().toArray();
    for (const col of colsDefault) {
        const count = await defaultDb.collection(col.name).countDocuments({
            $or: [
                { vpgTeamSlug: "rysix-gaming" },
                { vpgLeagueSlug: "segunda-division-a-spain" },
                { clubName: /rysix/i },
                { teamName: /rysix/i }
            ]
        });
        if (count > 0) {
            console.log(`- Collection ${col.name} has ${count} matching document(s).`);
            // print one
            const doc = await defaultDb.collection(col.name).findOne({
                $or: [
                    { vpgTeamSlug: "rysix-gaming" },
                    { vpgLeagueSlug: "segunda-division-a-spain" },
                    { clubName: /rysix/i },
                    { teamName: /rysix/i }
                ]
            });
            console.log(JSON.stringify(doc, null, 2));
        }
    }

    console.log('=== SEARCH FOR RYSIX IN TEST DB ===');
    const colsTest = await testDb.listCollections().toArray();
    for (const col of colsTest) {
        const count = await testDb.collection(col.name).countDocuments({
            $or: [
                { vpgTeamSlug: "rysix-gaming" },
                { vpgLeagueSlug: "segunda-division-a-spain" },
                { clubName: /rysix/i },
                { teamName: /rysix/i }
            ]
        });
        if (count > 0) {
            console.log(`- Collection ${col.name} has ${count} matching document(s).`);
            // print one
            const doc = await testDb.collection(col.name).findOne({
                $or: [
                    { vpgTeamSlug: "rysix-gaming" },
                    { vpgLeagueSlug: "segunda-division-a-spain" },
                    { clubName: /rysix/i },
                    { teamName: /rysix/i }
                ]
            });
            console.log(JSON.stringify(doc, null, 2));
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
