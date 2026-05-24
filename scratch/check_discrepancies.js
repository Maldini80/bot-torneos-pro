import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Fetching verified users...');
        const verifiedUsers = await db.collection('verified_users').find({}).toArray();
        console.log(`Total verified users: ${verifiedUsers.length}`);
        
        console.log('Fetching closed verification tickets...');
        const tickets = await db.collection('verificationtickets').find({ status: 'closed' }).toArray();
        console.log(`Total closed tickets: ${tickets.length}`);
        
        // Map tickets by userId (keep the latest one)
        const ticketMap = {};
        for (const ticket of tickets) {
            const userId = ticket.userId || ticket.discordId;
            if (!userId) continue;
            // If there are multiple, keep the latest one by createdAt or ObjectId
            if (!ticketMap[userId] || ticket._id.getTimestamp() > ticketMap[userId]._id.getTimestamp()) {
                ticketMap[userId] = ticket;
            }
        }
        
        console.log('\n--- Analyzing discrepancies ---');
        const discrepancies = [];
        
        for (const user of verifiedUsers) {
            const ticket = ticketMap[user.discordId];
            if (!ticket) {
                // User is verified but has no closed ticket in db
                continue;
            }
            
            const userPsn = (user.gameId || user.psnId || '').toLowerCase().trim();
            const ticketPsn = (ticket.gameId || ticket.psnId || '').toLowerCase().trim();
            
            if (userPsn !== ticketPsn && userPsn !== '' && ticketPsn !== '') {
                discrepancies.push({
                    discordId: user.discordId,
                    discordTag: user.discordTag || user.username,
                    verifiedPsn: user.gameId || user.psnId,
                    ticketPsn: ticket.gameId || ticket.psnId,
                    verifiedAt: user.verifiedAt,
                    ticketDate: ticket.createdAt
                });
            }
        }
        
        console.log(`Found ${discrepancies.length} discrepancy/discrepancies:`);
        console.log(JSON.stringify(discrepancies, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
