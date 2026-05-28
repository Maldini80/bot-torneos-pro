import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const jamClubId = "29376";
        
        console.log(`Listing all scanned matches for JAM Esports...`);
        const matches = await db.collection('scanned_matches').find({
            [`clubs.${jamClubId}`]: { $exists: true }
        }).sort({ timestamp: -1 }).toArray();
        
        console.log(`Total scanned matches for JAM: ${matches.length}`);
        
        // Group matches by date
        const matchGroups = {};
        for (const m of matches) {
            const dateStr = new Date(parseInt(m.timestamp)*1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
            if (!matchGroups[dateStr]) matchGroups[dateStr] = [];
            matchGroups[dateStr].push(m);
        }
        
        for (const date in matchGroups) {
            console.log(`\nDate: ${date} (${matchGroups[date].length} matches)`);
            for (const m of matchGroups[date]) {
                const timeStr = new Date(parseInt(m.timestamp)*1000).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' });
                const players = m.players?.[jamClubId] || {};
                const playerNames = Object.values(players).map(p => p.playername);
                console.log(` - Match ${m.matchId} at ${timeStr} | Opponent: ${Object.values(m.clubs).map(c => c.details?.name).filter(n => n !== 'JAM eSports')[0]}`);
                console.log(`   Players: ${playerNames.join(', ')}`);
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
