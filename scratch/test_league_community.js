const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const VPG_SPAIN_LEAGUES = [
    { id: 1, title: 'SUPERLIGA ESPAÑA IMPACT GAME A', slug: 'superliga-spain-a' },
    { id: 2, title: 'SUPERLIGA ESPAÑA IMPACT GAME B', slug: 'superliga-spain-b' },
    { id: 3, title: 'SEGUNDA DIVISION A', slug: 'segunda-division-a-spain' },
    { id: 4, title: 'SEGUNDA DIVISION B', slug: 'segunda-division-b-spain' },
    { id: 5, title: 'TERCERA DIVISION A', slug: 'tercera-division-a-spain' },
    { id: 6, title: 'TERCERA DIVISION B', slug: 'tercera-division-b-spain' },
    { id: 7, title: 'CUARTA DIVISION A', slug: 'cuarta-division-a-spain' },
    { id: 8, title: 'CUARTA DIVISION B', slug: 'cuarta-division-b-spain' },
    { id: 9, title: 'QUINTA DIVISION A', slug: 'quinta-division-a-spain' },
    { id: 10, title: 'QUINTA DIVISION B', slug: 'quinta-division-b-spain' },
    { id: 11, title: 'QUINTA DIVISION C', slug: 'quinta-division-c-spain' },
    { id: 12, title: 'QUINTA DIVISION D', slug: 'quinta-division-d-spain' },
];

async function test() {
    for (const league of VPG_SPAIN_LEAGUES) {
        const url = `https://api.virtualprogaming.com/public/leagues/${league.slug}/`;
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log(`League: ${league.slug} => community_id: ${data.community_id}, name: ${data.name}`);
        } else {
            console.log(`League: ${league.slug} => Error ${res.status}`);
        }
    }
}
test();
