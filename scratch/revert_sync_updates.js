import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const teamUpdates = [
  { "teamName": "Hugo", "reward": 2224000, "points": 27.8 },
  { "teamName": "Sin X FC", "reward": 1080000, "points": 13.5 },
  { "teamName": "Pinto Orejudo FC", "reward": 4736000, "points": 59.2 },
  { "teamName": "Nenas de JC", "reward": 576000, "points": 7.2 },
  { "teamName": "MAYANGODOWN", "reward": 2224000, "points": 27.8 },
  { "teamName": "PerezTM", "reward": 1944000, "points": 24.3 },
  { "teamName": "xXHatchZzz+ 10", "reward": 2224000, "points": 27.8 },
  { "teamName": "Danielito", "reward": 736000, "points": 9.2 },
  { "teamName": "Eric Armas", "reward": 2224000, "points": 27.8 },
  { "teamName": "BOOLS TEAM", "reward": 4736000, "points": 59.2 },
  { "teamName": "Comunistas FC", "reward": 1536000, "points": 19.2 },
  { "teamName": "Madeira fc", "reward": 1080000, "points": 13.5 },
  { "teamName": "Ccanoo71", "reward": 6560000, "points": 82 },
  { "teamName": "Aston birra", "reward": 5992000, "points": 74.9 },
  { "teamName": "toca y vete cacahuete", "reward": 1824000, "points": 22.8 },
  { "teamName": "Escaleras Balompie", "reward": 2224000, "points": 27.8 },
  { "teamName": "FC Puterazos", "reward": 1080000, "points": 13.5 },
  { "teamName": "Real Panchito FC", "reward": 2224000, "points": 27.8 },
  { "teamName": "Imperius", "reward": 1944000, "points": 24.3 },
  { "teamName": "Equipo xMati", "reward": 576000, "points": 7.2 },
  { "teamName": "Team xIsmjab", "reward": 1944000, "points": 24.3 },
  { "teamName": "Poyito99", "reward": 4736000, "points": 59.2 },
  { "teamName": "BorContunTeam", "reward": 4736000, "points": 59.2 },
  { "teamName": "Drifterking la cinta y el sprint", "reward": 4736000, "points": 59.2 },
  { "teamName": "XMagoOZX", "reward": 1944000, "points": 24.3 },
  { "teamName": "Visca team", "reward": 816000, "points": 10.2 },
  { "teamName": "FONFON X", "reward": 1944000, "points": 24.3 },
  { "teamName": "Autovía jr", "reward": 1080000, "points": 13.5 },
  { "teamName": "Lito Capitano", "reward": 1080000, "points": 13.5 },
  { "teamName": "Backupgk", "reward": 4736000, "points": 59.2 },
  { "teamName": "Pellizquito FC", "reward": 1824000, "points": 22.8 },
  { "teamName": "Team Alvaro", "reward": 736000, "points": 9.2 },
  { "teamName": "Poyitnet", "reward": 2224000, "points": 27.8 },
  { "teamName": "Vicente_haz", "reward": 1824000, "points": 22.8 },
  { "teamName": "Atleti", "reward": 240000, "points": 3 },
  { "teamName": "Tebi", "reward": 1984000, "points": 24.8 },
  { "teamName": "Panchitos Controlando", "reward": 1944000, "points": 24.3 },
  { "teamName": "Palmilla FC", "reward": 736000, "points": 9.2 },
  { "teamName": "DCR fc", "reward": 1360000, "points": 17 },
  { "teamName": "Danielito", "reward": 1080000, "points": 13.5 },
  { "teamName": "Aura FC", "reward": 1912000, "points": 23.9 },
  { "teamName": "CabezaFC", "reward": 1824000, "points": 22.8 },
  { "teamName": "LA MAZETA MECANICA", "reward": 4736000, "points": 59.2 },
  { "teamName": "Cafu Capitan", "reward": 688000, "points": 8.6 },
  { "teamName": "Tonitollora", "reward": 18432000, "points": 230.4 },
  { "teamName": "Birrareal CF", "reward": 576000, "points": 7.2 },
  { "teamName": "Ryux clan", "reward": 2472000, "points": 30.9 },
  { "teamName": "Payo Cayetano", "reward": 576000, "points": 7.2 },
  { "teamName": "Ñeverkusen FC", "reward": 1080000, "points": 13.5 },
  { "teamName": "Last Gol", "reward": 1600000, "points": 20 },
  { "teamName": "Roncha malo", "reward": 2520000, "points": 31.5 },
  { "teamName": "Jejeeee", "reward": 5032000, "points": 62.9 },
  { "teamName": "U.D Ñao", "reward": 1528000, "points": 19.1 },
  { "teamName": "La Sinduneta", "reward": 7200000, "points": 90 },
  { "teamName": "Gonxaaaa", "reward": 1976000, "points": 24.7 },
  { "teamName": "LeMapache", "reward": 1944000, "points": 24.3 },
  { "teamName": "xJzule", "reward": 576000, "points": 7.2 },
  { "teamName": "Golden Japan", "reward": 576000, "points": 7.2 },
  { "teamName": "Marceloret FC", "reward": 3192000, "points": 39.9 },
  { "teamName": "Vishi", "reward": 1600000, "points": 20 },
  { "teamName": "MANQUIS", "reward": 952000, "points": 11.9 },
  { "teamName": "Maiki FC", "reward": 7664000, "points": 95.8 },
  { "teamName": "Sile", "reward": 1040000, "points": 13 }
];

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log("=== Reverting Team updates ===");
        for (const update of teamUpdates) {
            // Find team in DB
            const team = await db.collection('fantasy_teams').findOne({ teamName: update.teamName });
            if (team) {
                // Subtract points and balance
                const result = await db.collection('fantasy_teams').updateOne(
                    { _id: team._id },
                    {
                        $inc: {
                            points: -update.points,
                            balance: -update.reward
                        }
                    }
                );
                console.log(`Reverted team "${update.teamName}": -${update.points} pts, -${update.reward.toLocaleString('es-ES')} €`);
            } else {
                console.warn(`Team "${update.teamName}" not found in DB!`);
            }
        }
        
        console.log("All team updates reverted successfully!");
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
