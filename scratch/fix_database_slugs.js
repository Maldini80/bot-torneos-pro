import dns from 'dns';
dns.setServers(['8.8.8.8']); // Google DNS for resolving Mongo SRV

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = await MongoClient.connect(process.env.DATABASE_URL);
    const db = client.db('tournamentBotDb');

    console.log('--- STARTING DATABASE SLUG MIGRATION ---');

    // 1. Update fantasy_config (active_leagues)
    const config = await db.collection('fantasy_config').findOne({ key: 'active_leagues' });
    if (config && Array.isArray(config.slugs)) {
        const updatedSlugs = config.slugs.map(s => {
            if (s === 'quinta-division-c-spain') return 'quinta-division-c';
            if (s === 'quinta-division-d-spain') return 'quinta-division-d';
            return s;
        });
        await db.collection('fantasy_config').updateOne(
            { key: 'active_leagues' },
            { $set: { slugs: updatedSlugs } }
        );
        console.log('✅ Updated fantasy_config (active_leagues) slugs.');
    }

    // 2. Update fantasy_leagues (vpgLeagues array)
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    let updatedLeaguesCount = 0;
    for (const l of leagues) {
        if (Array.isArray(l.vpgLeagues)) {
            const hasC = l.vpgLeagues.includes('quinta-division-c-spain');
            const hasD = l.vpgLeagues.includes('quinta-division-d-spain');
            if (hasC || hasD) {
                const newVpgLeagues = l.vpgLeagues.map(s => {
                    if (s === 'quinta-division-c-spain') return 'quinta-division-c';
                    if (s === 'quinta-division-d-spain') return 'quinta-division-d';
                    return s;
                });
                await db.collection('fantasy_leagues').updateOne(
                    { _id: l._id },
                    { $set: { vpgLeagues: newVpgLeagues } }
                );
                console.log(`✅ Updated league: ${l.name} (${l._id})`);
                updatedLeaguesCount++;
            }
        }
    }
    console.log(`✅ Finished updating fantasy_leagues (${updatedLeaguesCount} leagues updated).`);

    await client.close();
}

run().catch(console.error);
