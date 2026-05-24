import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

// Mock VPG Headers and fetch function
const VPG_HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function fetchFromVpg(path) {
    const [basePath, queryString] = path.split('?');
    const formattedBasePath = basePath.endsWith('/') ? basePath : basePath + '/';
    const url = `https://api.virtualprogaming.com/public/${formattedBasePath}${queryString ? '?' + queryString : ''}`;
    console.log(`[Mock VPG Fetch] URL: ${url}`);
    const res = await fetch(url, { headers: VPG_HEADERS, redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`VPG API error: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Replicating VPG Official Match Dates Endpoint Logic ---');
    try {
        // 1. Get all unique dates from our scanned_matches in MongoDB using aggregation
        const dbDates = await db.collection('scanned_matches').aggregate([
            {
                $project: {
                    dateStr: {
                        $dateToString: {
                            date: {
                                $toDate: {
                                    $multiply: [
                                        { $subtract: [ { $toDouble: "$timestamp" }, 14400 ] },
                                        1000
                                    ]
                                }
                            },
                            format: "%Y-%m-%d",
                            timezone: "Europe/Madrid"
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$dateStr",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]).toArray();

        console.log(`Step 1: Loaded ${dbDates.length} unique dates from database (offset -4h applied).`);

        const datesMap = new Map();
        for (const item of dbDates) {
            datesMap.set(item._id, {
                dateStr: item._id,
                count: item.count,
                isOfficial: false
            });
        }

        // 2. Find a team slug from VPG
        let teamSlug = null;
        const superligaSlugs = ['Esports-Premier-PS5', 'superliga-spain-a', 'superliga-spain-b'];
        for (const slug of superligaSlugs) {
            try {
                const tableData = await fetchFromVpg(`leagues/${slug}/table`);
                const teams = Array.isArray(tableData) ? tableData : (tableData.data || tableData.results || Object.values(tableData));
                if (teams.length > 0 && teams[0].team_slug) {
                    teamSlug = teams[0].team_slug;
                    console.log(`Step 2: Found team slug: ${teamSlug} in league: ${slug}`);
                    break;
                }
            } catch (_) { /* try next */ }
        }

        if (teamSlug) {
            // 3. Fetch VPG calendar dates (recent + upcoming) to merge
            for (const status of ['complete', 'scheduled']) {
                try {
                    let url = `teams/${teamSlug}/matches?match_status=${status}`;
                    let pageCount = 0;
                    const MAX_PAGES = 10; // Safety limit

                    while (url && pageCount < MAX_PAGES) {
                        pageCount++;
                        let data;
                        if (url.startsWith('http')) {
                            console.log(`Following pagination: ${url}`);
                            const directRes = await fetch(url, { headers: VPG_HEADERS, redirect: 'follow' });
                            if (!directRes.ok) break;
                            data = await directRes.json();
                        } else {
                            data = await fetchFromVpg(url);
                        }

                        const matches = Array.isArray(data) ? data : (data.results || data.data || []);
                        for (const m of matches) {
                            if (m.datetime) {
                                const d = new Date(m.datetime);
                                const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' });
                                const madridDate = formatter.format(d);
                                
                                if (datesMap.has(madridDate)) {
                                    datesMap.get(madridDate).isOfficial = true;
                                } else {
                                    datesMap.set(madridDate, {
                                        dateStr: madridDate,
                                        count: 0,
                                        isOfficial: true
                                    });
                                }
                            }
                        }

                        if (Array.isArray(data)) break;
                        url = data.next || null;
                    }
                } catch (e) {
                    console.error(`[VPG Dates] Error fetching VPG ${status} matches:`, e.message);
                }
            }
        }

        // Sort all dates chronologically
        const sortedDates = Array.from(datesMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
        
        console.log(`\nConsolidated dates count: ${sortedDates.length}`);
        console.log('\nTop 15 dates:');
        sortedDates.slice(0, 15).forEach(d => {
            console.log(`  - ${d.dateStr}: DB matches = ${d.count}, isOfficial = ${d.isOfficial}`);
        });

        console.log('\nLast 15 dates:');
        sortedDates.slice(-15).forEach(d => {
            console.log(`  - ${d.dateStr}: DB matches = ${d.count}, isOfficial = ${d.isOfficial}`);
        });

    } catch (err) {
        console.error('Logic test failed:', err);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
