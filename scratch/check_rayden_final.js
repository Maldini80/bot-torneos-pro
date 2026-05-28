import { MongoClient } from 'mongodb';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');

        console.log("=== BUSCANDO A 'zzraydenzz' EN PLAYER PROFILES ===");
        const profile = await db.collection('player_profiles').findOne({ eaPlayerName: /zzraydenzz/i });
        if (profile) {
            console.log(JSON.stringify(profile, null, 2));
        } else {
            console.log("No se encontró ningún perfil en player_profiles.");
        }

        console.log("\n=== BUSCANDO PROPIETARIOS EN FANTASY TEAMS ===");
        const teams = await db.collection('fantasy_teams').find({}).toArray();
        const foundTeams = [];
        for (const t of teams) {
            const players = t.players || [];
            const hasPlayer = players.some(p => p.toLowerCase() === 'zzraydenzz');
            const lineup = t.lineup || {};
            let isStarter = false;
            if (lineup.POR === 'zzRaydenzz') isStarter = true;
            if (Array.isArray(lineup.DFC) && lineup.DFC.includes('zzRaydenzz')) isStarter = true;
            if (Array.isArray(lineup.MC) && lineup.MC.includes('zzRaydenzz')) isStarter = true;
            if (Array.isArray(lineup.DC) && lineup.DC.includes('zzRaydenzz')) isStarter = true;

            if (hasPlayer) {
                foundTeams.push({
                    teamName: t.teamName,
                    discordUsername: t.discordUsername,
                    leagueId: t.leagueId,
                    isStarter: isStarter
                });
            }
        }
        if (foundTeams.length > 0) {
            console.log("Equipos que poseen a zzRaydenzz:", JSON.stringify(foundTeams, null, 2));
        } else {
            console.log("Ningún equipo del Fantasy posee a zzRaydenzz.");
        }
    } catch (e) {
        console.error("Error al consultar:", e);
    } finally {
        await client.close();
    }
}
run();
