import { getDb, connectDb } from './database.js';

async function investigate() {
    await connectDb();
    const db = getDb();
    
    console.log("--- Búsqueda de zzraydenzz ---");
    
    // Check vpg_users
    const userColl = db.collection('vpg_users');
    const user = await userColl.findOne({ $or: [{ eaId: /zzraydenzz/i }, { psnId: /zzraydenzz/i }, { discordUsername: /zzraydenzz/i }] });
    console.log("VPG User:", user);

    // Check player_profiles
    const profileColl = db.collection('player_profiles');
    const profile = await profileColl.findOne({ eaPlayerName: /zzraydenzz/i });
    console.log("Player Profile:", profile);

    // Check teams in 'test' database
    const testDb = getDb('test');
    const teamColl = testDb.collection('teams');
    const ceuta = await teamColl.findOne({ name: /Ceuta/i });
    console.log("Ceuta Guardians Team:", ceuta);
    
    const jam = await teamColl.findOne({ $or: [{ name: /JAM/i }, { vpgTeamSlug: /JAM/i }] });
    console.log("JAM ESPORTS Team:", jam);
    
    // Let's see if user discord ID is in jam
    if (user && jam) {
        console.log("Is user manager in JAM?", jam.managerId === user.discordId);
        console.log("Is user captain in JAM?", jam.captains && jam.captains.includes(user.discordId));
        console.log("Is user player in JAM?", jam.players && jam.players.includes(user.discordId));
    }
    
    process.exit(0);
}

investigate().catch(console.error);
