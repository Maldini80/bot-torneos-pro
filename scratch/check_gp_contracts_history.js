import fetch from 'node-fetch'; // wait, node v24 has global fetch

async function run() {
    const HEADERS = {
        'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
        'Accept': 'application/json',
    };

    const players = [
        'Castee_33', 'belversingh', 'xDoFlamingoo', 'ibaiapa11', 'El_Bueno_De_Link',
        'alvarotowerss', 'AlvaroSMX7', 'elkrakenn23_', 'MonKeyDFFYLU', 'popimarco11',
        'new_aitoryt', 'zegueretti', 'tsx-juanri2', 'bluewick83', 'pacto_fps_pvp-_-',
        'xalvar0v1ch', 'lilbieber3', 'marc_fnt', 'xcanta_7', 'danielgago7',
        'omaestrodobrasil', 'benavente_twelwe', 'clapeedbydani', 'aaron14', 'unnaiix',
        'xneymarjrr10'
    ];

    console.log('--- SCANNING CONTRACT HISTORY OF ALL GUINEA PINK PLAYERS ---');

    const affectedPlayers = [];

    for (const username of players) {
        const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (!res.ok) continue;
            const contracts = await res.json();
            if (!Array.isArray(contracts)) continue;

            // Check if any contract (active or inactive) is in a 5th division team
            // Let's print all 5th division contracts for this player
            const fifthDivContracts = contracts.filter(c => {
                const slug = String(c.team_slug || '').toLowerCase();
                // 5th division team slugs often have keywords or belong to fifth division leagues,
                // or we can see if the team_name/team_slug matches known 5th division teams.
                // Wait! Let's just print their contract team names and slugs so we can see.
                return true; 
            });

            console.log(`\nPlayer: ${username} has ${contracts.length} contracts:`);
            contracts.forEach(c => {
                console.log(`  - Team: "${c.team_name}" | Slug: "${c.team_slug}" | Status: ${c.status}`);
            });

            // Let's identify if they had any active/inactive contract in a known 5th division club
            // Known 5th div clubs: BOOLS TEAM, returns, principality, real slayers, Cordoba sur, etc.
        } catch (e) {
            // ignore error
        }
    }

    process.exit(0);
}

run();
