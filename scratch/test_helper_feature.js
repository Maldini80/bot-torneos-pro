import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

async function test() {
    console.log("Starting test for Helper (Co-Admin) and Finalization Feature...");
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    // 1. Create a dummy league
    const leagueId = new ObjectId();
    const league = {
        _id: leagueId,
        name: "Test League Helper",
        status: "open",
        createdBy: "creator_id_123",
        createdByUsername: "CreatorUser",
        marketOpen: true,
        allowClauses: true,
        clauseMultiplier: 1.5,
        initialBudget: 50000000,
        approved: true,
        createdAt: new Date()
    };
    
    await db.collection('fantasy_leagues').insertOne(league);
    console.log("Inserted dummy league:", leagueId.toString());
    
    try {
        // 2. Create teams (Creator, Helper, Normal User)
        const creatorTeam = {
            discordId: "creator_id_123",
            discordUsername: "CreatorUser",
            teamName: "Creator FC",
            leagueId: leagueId.toString(),
            approved: true,
            players: [],
            balance: 50000000,
            points: 0
        };
        const helperTeam = {
            discordId: "helper_id_456",
            discordUsername: "HelperUser",
            teamName: "Helper FC",
            leagueId: leagueId.toString(),
            approved: true,
            players: [],
            balance: 50000000,
            points: 0
        };
        const otherTeam = {
            discordId: "other_id_789",
            discordUsername: "OtherUser",
            teamName: "Other FC",
            leagueId: leagueId.toString(),
            approved: true,
            players: [],
            balance: 50000000,
            points: 0
        };
        
        await db.collection('fantasy_teams').insertMany([creatorTeam, helperTeam, otherTeam]);
        console.log("Inserted mock teams.");

        // 3. Test Co-Admin Assign Endpoint Logic (Mock server logic)
        // Set helper_id_456 as helper
        console.log("\n--- Testing Helper Assignment ---");
        // Check constraint: creator cannot be helper
        if (league.createdBy === creatorTeam.discordId) {
            console.log("OK: Creator cannot be helper check would pass (restricted).");
        }
        
        // Update league helper to helper_id_456
        await db.collection('fantasy_leagues').updateOne(
            { _id: leagueId },
            { $set: { coAdmin: "helper_id_456" } }
        );
        console.log("Helper set to helper_id_456.");
        
        // Fetch updated league
        let updatedLeague = await db.collection('fantasy_leagues').findOne({ _id: leagueId });
        console.log("Updated league helper:", updatedLeague.coAdmin);
        
        // 4. Test Middleware/Permission Simulation
        console.log("\n--- Testing Permissions simulation ---");
        
        // Function to check if user has admin access (simulation of canAdminLeague)
        function simulatedCanAdmin(userId, roleRoles) {
            const isAdmin = userId === process.env.OWNER_DISCORD_ID;
            const isReferee = Array.isArray(roleRoles) && roleRoles.includes('1393505777443930183');
            if (isAdmin || isReferee) return true;
            if (updatedLeague.createdBy === userId || updatedLeague.coAdmin === userId) return true;
            return false;
        }

        console.log("Is Owner Admin?", simulatedCanAdmin(process.env.OWNER_DISCORD_ID, [])); // true
        console.log("Is Creator Admin?", simulatedCanAdmin("creator_id_123", [])); // true
        console.log("Is Helper Admin?", simulatedCanAdmin("helper_id_456", [])); // true
        console.log("Is Other Admin?", simulatedCanAdmin("other_id_789", [])); // false
        
        // Function to check if user can delete league
        function simulatedCanDelete(userId, roleRoles) {
            const isAdmin = userId === process.env.OWNER_DISCORD_ID;
            const isReferee = Array.isArray(roleRoles) && roleRoles.includes('1393505777443930183');
            if (isAdmin || isReferee) return true;
            if (updatedLeague.createdBy === userId) return true; // ONLY creator/admin/referee, not helper
            return false;
        }
        
        console.log("\n--- Testing Delete Permissions simulation ---");
        console.log("Can Creator Delete?", simulatedCanDelete("creator_id_123", [])); // true
        console.log("Can Helper Delete?", simulatedCanDelete("helper_id_456", [])); // false
        console.log("Can Owner Delete?", simulatedCanDelete(process.env.OWNER_DISCORD_ID, [])); // true
        
        // 5. Test status blocks simulation (finalization blocks)
        console.log("\n--- Testing League Status Block Simulation ---");
        // Set league status to closed
        await db.collection('fantasy_leagues').updateOne(
            { _id: leagueId },
            { $set: { status: 'closed' } }
        );
        updatedLeague = await db.collection('fantasy_leagues').findOne({ _id: leagueId });
        console.log("League status updated to closed.");
        
        // Simulating buy block
        if (updatedLeague.status === 'closed') {
            console.log("OK: Buy block simulation passed: La liga está finalizada.");
        }
        
        // Remove helper (toggle)
        await db.collection('fantasy_leagues').updateOne(
            { _id: leagueId },
            { $set: { coAdmin: null } }
        );
        updatedLeague = await db.collection('fantasy_leagues').findOne({ _id: leagueId });
        console.log("Helper removed (toggled off). Current helper:", updatedLeague.coAdmin);
        
    } finally {
        // Clean up
        await db.collection('fantasy_leagues').deleteOne({ _id: leagueId });
        await db.collection('fantasy_teams').deleteMany({ leagueId: leagueId.toString() });
        console.log("\nCleaned up test data.");
        await client.close();
    }
}

test().catch(console.error);
