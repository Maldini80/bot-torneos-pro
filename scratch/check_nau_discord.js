import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

async function run() {
    client.once('ready', async () => {
        try {
            console.log('Logged in to Discord as:', client.user.tag);
            const guildId = process.env.GUILD_ID;
            const guild = await client.guilds.fetch(guildId);
            console.log('Connected to Guild:', guild.name);

            // Fetch member by ID: 435171084577538059
            const memberById = await guild.members.fetch('435171084577538059').catch(() => null);
            if (memberById) {
                console.log('Found member by ID:');
                console.log('Username:', memberById.user.username);
                console.log('Tag:', memberById.user.tag);
                console.log('Display Name:', memberById.displayName);
                console.log('Roles:', memberById.roles.cache.map(r => `${r.name} (${r.id})`));
            } else {
                console.log('Member NOT found by ID 435171084577538059.');
            }

            // Search members by query 'nau'
            console.log('\nSearching for members with username containing "nau"...');
            const searchResults = await guild.members.search({ query: 'nau', limit: 10 });
            searchResults.forEach(m => {
                console.log(`- ${m.user.username} (${m.user.id}) | Display: ${m.displayName}`);
                console.log(`  Roles: ${m.roles.cache.map(r => r.name).join(', ')}`);
            });

        } catch (err) {
            console.error('Error in script:', err);
        } finally {
            client.destroy();
        }
    });

    await client.login(process.env.DISCORD_TOKEN);
}

run().catch(console.error);
