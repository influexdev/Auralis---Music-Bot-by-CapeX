const crypto = require('node:crypto');
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { getMeta, setMeta } = require('./store');

function toSlash(cmd) {
  const builder = new SlashCommandBuilder().setName(cmd.name).setDescription(cmd.description);
  cmd.slash?.(builder);
  return builder.toJSON();
}

// Registers every slash command with Discord. Called automatically on startup; it skips the API call
// when nothing changed since the last registration (Discord limits how often commands can be created).
async function registerSlashCommands(registry, { force = false, useCache = true } = {}) {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error('DISCORD_TOKEN and CLIENT_ID are required to register slash commands.');
  const guildId = GUILD_ID && !GUILD_ID.startsWith('YOUR_') ? GUILD_ID : null;
  const body = registry.list.map(toSlash);
  const hash = crypto.createHash('sha1').update(JSON.stringify({ body, scope: guildId || 'global', client: CLIENT_ID })).digest('hex');

  if (useCache && !force) {
    const saved = await getMeta('slash-commands').catch(() => null);
    if (saved?.hash === hash) { console.log(`Slash commands already up to date (${body.length}).`); return false; }
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(guildId ? Routes.applicationGuildCommands(CLIENT_ID, guildId) : Routes.applicationCommands(CLIENT_ID), { body });
  if (useCache) await setMeta('slash-commands', { hash, updatedAt: Date.now() }).catch(() => {});
  console.log(`Registered ${body.length} slash commands ${guildId ? `in server ${guildId} (instant)` : 'globally (can take a few minutes to appear)'}.`);
  return true;
}

module.exports = { registerSlashCommands, toSlash };
