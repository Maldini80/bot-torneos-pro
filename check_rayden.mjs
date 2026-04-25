import { getDb } from './database.js';

async function investigate() {
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

    // Check teams
    const teamColl = db.collection('teams');
    const ceuta = await teamColl.findOne({ name: /Ceuta/i });
    console.log("Ceuta Guardians Team:", ceuta);
    
    // Let's see if user discord ID is in ceuta
    if (user && ceuta) {
        console.log("Is user manager?", ceuta.managerId === user.discordId);
        console.log("Is user captain?", ceuta.captains && ceuta.captains.includes(user.discordId));
        console.log("Is user player?", ceuta.players && ceuta.players.includes(user.discordId));
    }
    
    process.exit(0);
}

investigate().catch(console.error);
