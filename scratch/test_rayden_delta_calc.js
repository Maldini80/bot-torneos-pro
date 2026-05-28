import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    const playerColl = db.collection('player_profiles');

    const profile = await playerColl.findOne({ eaPlayerName: /zzraydenzz/i });
    if (!profile) {
        console.error("Profile not found!");
        process.exit(1);
    }

    console.log("=== Profile Document ===");
    console.log(JSON.stringify(profile, null, 2));

    const crawledTeamSlug = "JAM-ES";
    const crawledPoints = 37.0;

    const pSlugNormalized = String(crawledTeamSlug || '').toLowerCase().trim();
    const dbSlugNormalized = String(profile.vpgTeamSlug || '').toLowerCase().trim();
    const hasTransferred = dbSlugNormalized && pSlugNormalized && dbSlugNormalized !== pSlugNormalized;

    const lastRaw = hasTransferred ? {} : (profile.stats?.vpgLastRaw || profile.stats || {});

    console.log("\n=== Delta Calculation Trace ===");
    console.log("pSlugNormalized:", pSlugNormalized);
    console.log("dbSlugNormalized:", dbSlugNormalized);
    console.log("hasTransferred:", hasTransferred);
    console.log("lastRaw:", JSON.stringify(lastRaw, null, 2));
    console.log("crawledPoints:", crawledPoints);
    
    const deltaPoints = Math.max(0, Math.round((crawledPoints - (parseFloat(lastRaw.vpgPoints) || 0)) * 10) / 10);
    console.log("deltaPoints calculated:", deltaPoints);

    process.exit(0);
}

run().catch(console.error);
