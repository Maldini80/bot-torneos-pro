import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const url = 'https://api.virtualprogaming.com/public/teams/JAM-ES/contracts/';
    console.log("=== FETCHING JAM ESPORTS CONTRACTS ===");
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const contracts = await res.json();
            console.log(`Found ${contracts.length} contracts for JAM ESPORTS.`);
            const active = contracts.filter(c => c.status === 'active');
            console.log(`Active contracts: ${active.length}`);
            
            const raydenContract = active.find(c => c.username && c.username.toLowerCase() === 'zzraydenzz');
            if (raydenContract) {
                console.log("\n🎉 CONTRATO DE RAYDEN ENCONTRADO:");
                console.log(JSON.stringify(raydenContract, null, 2));
            } else {
                console.log("\n❌ RAYDEN NO tiene un contrato activo en JAM ESPORTS en la respuesta de la API.");
                // Print all usernames with active contracts
                console.log("Usernames with active contracts:");
                active.forEach(c => console.log(` - ${c.username} (ID: ${c.user_id})`));
            }
        } else {
            console.log(`Error: HTTP ${res.status}`);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
