const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function main() {
    const url = 'https://api.virtualprogaming.com/public/leagues/superliga-spain-a/table/';
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    console.log('Superliga A Table Team Names:');
    data.forEach(t => {
        console.log(`- "${t.team_name}" (Slug: "${t.team_slug}", Abbr: "${t.team_abbr}")`);
    });

    const urlB = 'https://api.virtualprogaming.com/public/leagues/superliga-spain-b/table/';
    const resB = await fetch(urlB, { headers: HEADERS });
    const dataB = await resB.json();
    console.log('\nSuperliga B Table Team Names:');
    dataB.forEach(t => {
        console.log(`- "${t.team_name}" (Slug: "${t.team_slug}", Abbr: "${t.team_abbr}")`);
    });
}
main().catch(console.error);
