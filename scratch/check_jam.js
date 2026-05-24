import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    // Buscar el equipo "JAM eSports" o similar
    const team = await db.collection('teams').findOne({ name: /JAM/i });
    if (!team) {
        console.log("No se encontró ningún equipo con JAM en el nombre.");
        await client.close();
        return;
    }
    
    console.log("Equipo encontrado:", team.name);
    console.log("eaClubId:", team.eaClubId);
    console.log("eaPlatform:", team.eaPlatform);
    
    // Consola EA Headers
    const EA_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Origin': 'https://www.ea.com',
        'Referer': 'https://www.ea.com/'
    };
    
    const url = `https://proclubs.ea.com/api/fc/members/stats?clubIds=${team.eaClubId}&platform=${team.eaPlatform}`;
    console.log("Fetching url:", url);
    
    const res = await fetch(url, { headers: EA_HEADERS }).catch(e => {
        console.error("Fetch error:", e);
        return null;
    });
    
    if (res && res.ok) {
        const data = await res.json();
        console.log("Data keys:", Object.keys(data));
        
        let members = [];
        if (Array.isArray(data)) {
            members = data;
        } else if (data.members) {
            members = data.members;
        } else if (data[team.eaClubId]) {
            members = data[team.eaClubId];
        } else if (data[team.eaClubId]?.members) {
            members = data[team.eaClubId].members;
        } else {
            members = Object.values(data)[0] || [];
            if (members.members) members = members.members;
        }
        
        console.log("Total members found:", members.length);
        
        // Buscar a zzRaydenzz
        const rayden = members.find(m => (m.name || m.playername || '').toLowerCase().includes('rayden'));
        if (rayden) {
            console.log("=== RAW DATA FOR RAYDEN ===");
            console.log(JSON.stringify(rayden, null, 2));
        } else {
            console.log("No se encontró a zzRaydenzz en los miembros devueltos por la API.");
            console.log("Lista de miembros devueltos:");
            members.forEach(m => console.log("- " + (m.name || m.playername)));
        }
    } else {
        console.log("Error al consultar la API de EA:", res ? res.status : "No response");
    }
    
    await client.close();
}

main().catch(console.error);
