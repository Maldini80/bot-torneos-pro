import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    const team = await db.collection('teams').findOne({ name: /JAM/i });
    if (!team) {
        console.log("No se encontró ningún equipo con JAM en el nombre.");
        await client.close();
        return;
    }
    
    console.log("Equipo encontrado:", team.name);
    console.log("eaClubId:", team.eaClubId);
    console.log("eaPlatform:", team.eaPlatform);
    
    const EA_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Origin': 'https://www.ea.com',
        'Referer': 'https://www.ea.com/'
    };
    
    const endpoints = [
        `https://proclubs.ea.com/api/fc/members/stats?clubIds=${team.eaClubId}&platform=${team.eaPlatform}`,
        `https://proclubs.ea.com/api/fc/members/career/stats?clubIds=${team.eaClubId}&platform=${team.eaPlatform}`,
        `https://proclubs.ea.com/api/fc/members/stats?clubId=${team.eaClubId}&platform=${team.eaPlatform}`,
        `https://proclubs.ea.com/api/fc/members/career/stats?clubId=${team.eaClubId}&platform=${team.eaPlatform}`,
    ];
    
    for (const url of endpoints) {
        console.log("\nTrying:", url);
        const res = await fetch(url, { headers: EA_HEADERS }).catch(e => {
            console.error("Fetch error:", e);
            return null;
        });
        
        if (res && res.ok) {
            const data = await res.json();
            let members = [];
            if (Array.isArray(data)) {
                members = data;
            } else if (data.members && Array.isArray(data.members)) {
                members = data.members;
            } else if (data[String(team.eaClubId)] && Array.isArray(data[String(team.eaClubId)])) {
                members = data[String(team.eaClubId)];
            } else if (data[String(team.eaClubId)]?.members) {
                members = data[String(team.eaClubId)].members;
            } else {
                for (const val of Object.values(data)) {
                    if (Array.isArray(val) && val.length > 0) { members = val; break; }
                    if (val?.members && Array.isArray(val.members)) { members = val.members; break; }
                }
            }
            
            console.log(`Success! Total members found: ${members.length}`);
            if (members.length > 0) {
                console.log("All members in response:");
                members.forEach(m => {
                    console.log(`- Player: ${m.name || m.playername} | Games: ${m.gamesPlayed} | Height: ${m.proHeight || m.height} | Pos: ${m.proPos}`);
                });
            }
        } else {
            console.log("Error status:", res ? res.status : "No response");
        }
    }
    
    await client.close();
}

main().catch(console.error);
