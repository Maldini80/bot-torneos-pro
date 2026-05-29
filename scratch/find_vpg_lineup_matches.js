import fetch from 'node-fetch';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');

        // 1. Fetch official VPG matches of Golden Knights
        const url = 'https://api.virtualprogaming.com/public/teams/GOLDEN-KNIGHTS/matches/?match_status=complete';
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) {
            console.error("Failed to fetch VPG matches");
            return;
        }
        const matchesData = await res.json();
        const vpgMatches = matchesData.data || [];
        console.log(`Found ${vpgMatches.length} completed matches for Golden Knights in VPG API.`);

        // 2. Fetch all scanned matches from DB where pandax played
        const allDbMatches = await db.collection('scanned_matches').find({}).toArray();
        const pandaxMatches = [];

        for (const m of allDbMatches) {
            if (m.players && m.players['5549']) {
                const clubPlayers = m.players['5549'];
                for (const playerId of Object.keys(clubPlayers)) {
                    const player = clubPlayers[playerId];
                    const playerName = player.playername || player.playerName || '';
                    if (playerName.toLowerCase().includes('pandax')) {
                        pandaxMatches.push(m);
                    }
                }
            }
        }
        console.log(`Found ${pandaxMatches.length} matches in local database where Pandax played.`);

        // 3. For each VPG match, find if we have a matching scanned match where Pandax played
        console.log('\n=== CROSS-REFERENCING VPG MATCHES WITH PLAYED LINEUPS ===');
        
        for (const vm of vpgMatches) {
            const vpgDate = new Date(vm.datetime);
            const vpgOpponentSlug = vm.home_slug === 'GOLDEN-KNIGHTS' ? vm.away_slug : vm.home_slug;
            const vpgOpponentName = vm.home_slug === 'GOLDEN-KNIGHTS' ? vm.away_name : vm.home_name;
            const vpgOppGoals = vm.home_slug === 'GOLDEN-KNIGHTS' ? vm.away_score : vm.home_score;
            const vpgGkGoals = vm.home_slug === 'GOLDEN-KNIGHTS' ? vm.home_score : vm.away_score;

            // Find matching db match played on the same day (+- 12 hours) and against the same opponent (approx name check)
            const matchedDb = pandaxMatches.find(dbm => {
                const dbDate = new Date(parseInt(dbm.timestamp) * 1000);
                const dayDiff = Math.abs(dbDate - vpgDate) / (1000 * 60 * 60);
                if (dayDiff > 12) return false;

                // Check opponent name/slug
                const clubKeys = Object.keys(dbm.clubs || {});
                const oppId = clubKeys.find(k => k !== '5549');
                const dbOppName = dbm.clubs[oppId]?.details?.name || '';
                
                // Compare name similarity
                const clean = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanVpg = clean(vpgOpponentName);
                const cleanDb = clean(dbOppName);
                
                return cleanVpg.includes(cleanDb) || cleanDb.includes(cleanVpg) || 
                       clean(vpgOpponentSlug).includes(cleanDb) || cleanDb.includes(clean(vpgOpponentSlug));
            });

            if (matchedDb) {
                const dbDate = new Date(parseInt(matchedDb.timestamp) * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
                console.log(`\n🎉 MATCH MATCHED: VPG Match Day ${vm.match_day} (${vpgDate.toLocaleDateString()})`);
                console.log(`  VPG Official: Golden Knights ${vpgGkGoals} - ${vpgOppGoals} ${vpgOpponentName}`);
                console.log(`  Played Game:  [${dbDate}] Opponent in Game: ${matchedDb.clubs[Object.keys(matchedDb.clubs).find(k => k !== '5549')].details?.name}`);
                
                const player = Object.values(matchedDb.players['5549']).find(p => p.playername.toLowerCase().includes('pandax'));
                console.log(`  Pandax Stats in this match: Rating: ${player.rating} | Pos: ${player.pos} | G: ${player.goals || 0} | A: ${player.assists || 0}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
