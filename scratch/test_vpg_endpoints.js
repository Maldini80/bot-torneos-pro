import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const VPG_SPAIN_LEAGUES = [
    { title: 'SUPERLIGA ESPAÑA IMPACT GAME A', slug: 'superliga-spain-a' },
    { title: 'SUPERLIGA ESPAÑA IMPACT GAME B', slug: 'superliga-spain-b' },
    { title: 'SEGUNDA DIVISION A', slug: 'segunda-division-a-spain' },
    { title: 'SEGUNDA DIVISION B', slug: 'segunda-division-b-spain' },
    { title: 'TERCERA DIVISION A', slug: 'tercera-division-a-spain' },
    { title: 'TERCERA DIVISION B', slug: 'tercera-division-b-spain' },
    { title: 'CUARTA DIVISION A', slug: 'cuarta-division-a-spain' },
    { title: 'CUARTA DIVISION B', slug: 'cuarta-division-b-spain' },
    { title: 'QUINTA DIVISION A', slug: 'quinta-division-a-spain' },
    { title: 'QUINTA DIVISION B', slug: 'quinta-division-b-spain' },
    { title: 'QUINTA DIVISION C', slug: 'quinta-division-c-spain' },
    { title: 'QUINTA DIVISION D', slug: 'quinta-division-d-spain' },
];

async function main() {
    console.log("Searching for Jam eSports in all VPG leagues...");
    for (const league of VPG_SPAIN_LEAGUES) {
        const url = `https://api.virtualprogaming.com/public/leagues/${league.slug}/table/`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const table = await res.json();
                const found = table.find(t => t.team_name && t.team_name.toLowerCase().includes('jam'));
                if (found) {
                    console.log(`\n🎉 Found in: ${league.title} (${league.slug})`);
                    console.log(`Team: ${found.team_name} | Slug: ${found.team_slug} | Points: ${found.points} | Logo: ${found.team_logo}`);
                }
            }
        } catch (e) {
            console.error(`Failed ${league.slug}:`, e.message);
        }
    }
}

main().catch(console.error);
