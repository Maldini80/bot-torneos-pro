import { MongoClient } from 'mongodb';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
    
    client.once('ready', async () => {
        try {
            console.log('Bot is ready. Checking Satita roles...');
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch('1264218593793413182');
            
            console.log(`Member: ${member.user.tag} (${member.id})`);
            console.log('Roles list:');
            member.roles.cache.forEach(role => {
                console.log(`- Name: "${role.name}", ID: "${role.id}"`);
            });
            
        } catch (e) {
            console.error(e);
        } finally {
            client.destroy();
        }
    });
    
    await client.login(process.env.DISCORD_TOKEN);
}
run();
