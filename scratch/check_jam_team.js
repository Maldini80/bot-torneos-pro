import { MongoClient } from 'mongodb';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        
        console.log("=== BUSCANDO 'JAM ESPORTS' EN LA BASE DE DATOS ===");
        const jam = await testDb.collection('teams').findOne({ $or: [{ name: /JAM/i }, { vpgTeamSlug: /JAM/i }] });
        console.log("JAM Team Doc:", JSON.stringify(jam, null, 2));

        if (jam && jam.vpgLeagueSlug) {
            console.log(`\nJAM está en la liga: ${jam.vpgLeagueSlug}`);
            // Querying table/standings of VPG for this league
            const tableUrl = `https://api.virtualprogaming.com/public/leagues/${jam.vpgLeagueSlug}/table/`;
            const tableRes = await fetch(tableUrl, { headers: HEADERS });
            if (tableRes.ok) {
                const table = await tableRes.json();
                const foundTeam = table.find(t => t.team_slug === 'JAM-ES');
                console.log("\nJAM stats in VPG Standings:", JSON.stringify(foundTeam, null, 2));
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
