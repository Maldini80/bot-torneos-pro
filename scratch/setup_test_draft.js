import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL is not defined.');
    process.exit(1);
}

async function run() {
    const client = new MongoClient(dbUrl);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');

        // Clean up previous test drafts
        await db.collection('drafts').deleteOne({ shortId: 'test-draft-antigravity' });

        const order = [];
        const captains = [];
        const players = [];

        // Generate 12 captains and their team assignments
        const positionsList = ['GK', 'DFC', 'CARR', 'MC', 'DC'];
        for (let i = 1; i <= 12; i++) {
            const capId = `test_cap_${i}`;
            order.push(capId);
            const pos = positionsList[(i - 1) % positionsList.length];
            
            captains.push({
                userId: capId,
                userName: `Capitan_${i}`,
                teamName: `TEAM ${i} (TEST)`,
                eafcTeamName: `TEAM_${i}_FC`,
                streamChannel: `https://twitch.tv/cap_${i}`,
                psnId: `PSN_CAP_${i}`,
                twitter: `cap_${i}_tw`,
                whatsapp: `+346000000${String(i).padStart(2, '0')}`,
                position: pos
            });

            // Captain as player in their team
            players.push({
                userId: capId,
                userName: `Capitan_${i}`,
                psnId: `PSN_CAP_${i}`,
                eafcTeamName: `TEAM_${i}_FC`,
                twitter: `cap_${i}_tw`,
                whatsapp: `+346000000${String(i).padStart(2, '0')}`,
                primaryPosition: pos,
                secondaryPosition: 'NONE',
                currentTeam: `TEAM ${i} (TEST)`,
                isCaptain: true,
                captainId: capId,
                createdAt: new Date()
            });
        }

        // Generate 250 free agents
        for (let i = 1; i <= 250; i++) {
            const randomPos = positionsList[(i - 1) % positionsList.length];
            const userId = `test_player_${i}`;
            players.push({
                userId,
                userName: `Jugador_Test_${i}`,
                psnId: `PSN_TEST_${i}_${randomPos}`,
                twitter: 'NONE',
                whatsapp: `600000${String(i).padStart(3, '0')}`,
                primaryPosition: randomPos,
                secondaryPosition: 'NONE',
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                createdAt: new Date()
            });
        }

        const testDraft = {
            shortId: 'test-draft-antigravity',
            guildId: '1392406961957638205',
            name: 'TEST DRAFT ANTIGRAVITY (12 TEAMS / 250 PLAYERS)',
            draftName: 'TEST DRAFT ANTIGRAVITY (12 TEAMS / 250 PLAYERS)',
            status: 'seleccion',
            createdAt: new Date(),
            config: {
                isPaid: false,
                entryFee: 0,
                prizeCampeon: 0,
                prizeFinalista: 0
            },
            captains,
            pendingCaptains: {},
            players,
            pendingPayments: {},
            selection: {
                turn: 0,
                order,
                currentPick: 1,
                isPicking: true,
                activeInteractionId: null
            },
            discordChannelId: null,
            discordMessageIds: {}
        };

        await db.collection('drafts').insertOne(testDraft);
        console.log('✅ Created test draft in database successfully!');
        console.log('ShortId: test-draft-antigravity');
        console.log('Teams/Captains: 12');
        console.log('Free Agents (Libres): 250');
        console.log('Total players in document: ' + players.length);
        console.log('Open in admin panel: admin.html?draftId=test-draft-antigravity');
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
