const path = require('path');
const { REST, Routes } = require('discord.js');
const { loadEnv } = require('./env');
const { commands } = require('./commands');

loadEnv(path.join(__dirname, '.env'));

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('Setează DISCORD_TOKEN și DISCORD_CLIENT_ID în bot/.env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);
const body = commands.map(command => command.toJSON());

async function register() {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Comenzi înregistrate pe serverul ${guildId}.`);
    return;
  }
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log('Comenzi înregistrate global. Pot apărea după câteva minute.');
}

register().catch(err => {
  console.error(err);
  process.exit(1);
});
