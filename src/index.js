require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, Events, MessageFlags } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const { makeEmbed } = require('./utils/embed');
const { UserError } = require('./utils/errors');
const { connectDatabase, closeDatabase, settings, blacklist } = require('./utils/store');
const { isOwner } = require('./utils/config');
const { isAdmin } = require('./utils/permissions');
const { fromMessage, fromInteraction } = require('./utils/context');
const filters = require('./utils/filters');
const M = require('./utils/music');
const { loadCommands } = require('./commands');
const { registerSlashCommands } = require('./utils/register');

const token = process.env.DISCORD_TOKEN;
if (!token || token === 'YOUR_DISCORD_BOT_TOKEN') throw new Error('Set DISCORD_TOKEN in your .env file.');
if (!process.env.CLIENT_ID || process.env.CLIENT_ID.startsWith('YOUR_')) throw new Error('Set CLIENT_ID in your .env file.');
if (!process.env.LAVALINK_HOST || process.env.LAVALINK_HOST.startsWith('your-')) throw new Error('Set your Lavalink connection details in .env.');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  allowedMentions: { parse: [], repliedUser: false }
});
const manager = new LavalinkManager({
  nodes: [{ id: 'main', host: process.env.LAVALINK_HOST, port: Number(process.env.LAVALINK_PORT || 2333), authorization: process.env.LAVALINK_PASSWORD, secure: String(process.env.LAVALINK_SECURE).toLowerCase() === 'true' }],
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
  client: { id: process.env.CLIENT_ID, username: 'Auralis' },
  autoSkip: true,
  playerOptions: { defaultSearchPlatform: 'ytsearch', onDisconnect: { autoReconnect: false, destroyPlayer: true }, useUnresolvedData: true }
});
const registry = loadCommands();

const errorEmbed = (title, text) => makeEmbed(title, text);

// ---------- checks every command goes through ----------
function checkAccess(cmd, ctx) {
  const owner = isOwner(ctx.user.id);
  if (cmd.ownerOnly && !owner) throw new UserError('Only the bot owner can use this command.', 'Permission Required');
  if (cmd.adminOnly && !owner && !isAdmin(ctx.member)) throw new UserError('Manage Server permission is required.', 'Permission Required');
  const player = manager.getPlayer(ctx.guild.id);
  if (cmd.needsPlayer && !player) throw new UserError('There is no active player in this server.');
  if (cmd.needsPlaying && !M.getCurrent(player)) throw new UserError('Nothing is playing right now.');
  if (cmd.needsVoice) M.assertSameVoice(ctx, player);
}
// Returns an error message if this user/channel is not allowed to use commands right now, otherwise null.
function blockedReason(cmd, guild, member, user, channelId) {
  if (!isOwner(user.id) && blacklist.has(user.id)) return 'You have been blacklisted from using Auralis.';
  const channel = settings.getGuild(guild.id).commandChannel;
  if (channel && channel !== channelId && cmd.name !== 'commandchannel' && !isOwner(user.id) && !isAdmin(member)) return `Please use commands in <#${channel}>.`;
  return null;
}
async function reportError(ctx, error) {
  if (!(error instanceof UserError)) console.error(error);
  const embed = errorEmbed(error.title || 'Command Error', truncateText(error?.message || 'Something went wrong.'));
  await ctx.reply({ embeds: [embed] }).catch(() => {});
}
const truncateText = t => (t.length > 500 ? `${t.slice(0, 499)}…` : t);

// ---------- ready / lavalink ----------
let restored = false;
async function restore247() {
  if (restored) return; restored = true;
  let ok = 0, total = 0;
  for (const [guildId, cfg] of settings.entries()) {
    if (!cfg.twentyFourSeven || !cfg.voiceChannelId) continue;
    total++;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) { console.warn(`24/7: bot is no longer in server ${guildId}, skipping.`); continue; }
      const channel = guild.channels.cache.get(cfg.voiceChannelId);
      if (!channel) { console.warn(`24/7: voice channel ${cfg.voiceChannelId} missing in ${guild.name}, skipping.`); continue; }
      if (manager.getPlayer(guildId)) { ok++; continue; }
      const player = manager.createPlayer({ guildId, voiceChannelId: channel.id, textChannelId: cfg.textChannelId || undefined, selfDeaf: true, volume: cfg.volume ?? 80 });
      await player.connect();
      ok++;
    } catch (error) { console.error(`24/7 restore failed for ${guildId}:`, error.message); }
  }
  console.log(`24/7 restore: rejoined ${ok}/${total} server(s).`);
}
client.once(Events.ClientReady, async () => {
  console.log(`Auralis online as ${client.user.tag}`);
  client.user.setActivity('music | /help', { type: ActivityType.Listening });
  // Slash commands are registered automatically on every start (skipped when nothing changed).
  try { await registerSlashCommands(registry); }
  catch (error) { console.error('Slash command registration failed:', error.message); }
  try { await manager.init({ id: client.user.id, username: client.user.username }); }
  catch (error) { console.error('Lavalink init error:', error); }
});
client.on('raw', packet => manager.sendRawData(packet));
manager.nodeManager.on('connect', node => { console.log(`Lavalink node connected: ${node.id}`); restore247(); });
manager.nodeManager.on('disconnect', (node, reason) => console.warn(`Lavalink node ${node.id} disconnected:`, reason?.reason || reason?.code || ''));
manager.nodeManager.on('error', (node, error) => console.error(`Lavalink node ${node.id} error:`, error));

// ---------- player events ----------
const say = (player, title, text) => client.channels.cache.get(player.textChannelId)?.send({ embeds: [makeEmbed(title, text)] }).catch(() => {});
manager.on('trackStart', (player, track) => { M.clearIdle(player.guildId); M.announceTrack(client, player, track); });
manager.on('trackError', (player, track, payload) => say(player, 'Playback Error', `Could not play **${M.titleOf(track)}**: ${payload?.exception?.message || 'unknown error'}`));
manager.on('trackStuck', (player, track) => say(player, 'Track Stuck', `**${M.titleOf(track)}** got stuck, skipping.`));
manager.on('queueEnd', async (player, track) => {
  M.clearNowPlaying(player.guildId);
  if (M.runtime.silentEnd.delete(player.guildId)) return M.scheduleIdle(manager, player.guildId);
  if (settings.getGuild(player.guildId).autoplay && await M.tryAutoplay(client, player, track)) return;
  say(player, 'Queue Finished', 'There are no more tracks in the queue.');
  M.scheduleIdle(manager, player.guildId);
});
manager.on('playerDestroy', player => {
  M.clearNowPlaying(player.guildId); M.clearIdle(player.guildId); M.clearTimer('alone', player.guildId); filters.forgetFilter(player.guildId);
});

// Leave if everyone left the voice channel (unless 24/7 is on).
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const player = manager.getPlayer(guild.id);
  if (!player || settings.getGuild(guild.id).twentyFourSeven) return;
  const channel = guild.channels.cache.get(player.voiceChannelId);
  const humans = channel?.members?.filter(m => !m.user.bot).size ?? 0;
  if (humans > 0) return M.clearTimer('alone', guild.id);
  M.setTimer('alone', guild.id, 60000, async () => {
    const p = manager.getPlayer(guild.id); const c = guild.channels.cache.get(p?.voiceChannelId);
    if (p && !(c?.members?.some(m => !m.user.bot))) { say(p, 'Disconnected', 'Everyone left the voice channel, so I left too.'); await p.destroy().catch(() => {}); }
  });
});

// ---------- slash commands + now playing buttons ----------
async function handleNowPlayingButton(interaction) {
  const ephemeral = text => interaction.reply({ embeds: [makeEmbed('Command Error', text)], flags: MessageFlags.Ephemeral });
  if (!interaction.guild) return;
  if (!isOwner(interaction.user.id) && blacklist.has(interaction.user.id)) return ephemeral('You have been blacklisted from using Auralis.');
  const player = manager.getPlayer(interaction.guildId);
  if (!player) return ephemeral('There is no active player in this server.');
  const vc = interaction.member?.voice?.channel;
  if (!vc || vc.id !== player.voiceChannelId) return ephemeral(`Join <#${player.voiceChannelId}> to use these controls.`);
  try {
    switch (interaction.customId.split(':')[2]) {
      case 'pause': if (player.paused) await M.resumePlayer(player); else await M.pausePlayer(player); break;
      case 'loop': await M.setLoop(player, M.nextLoopMode(player.repeatMode)); break;
      case 'skip': await M.skipPlayer(player); return interaction.deferUpdate();
      case 'previous': await M.previousPlayer(player); return interaction.deferUpdate();
      case 'stop': await M.stopPlayer(player); M.clearNowPlaying(interaction.guildId); return interaction.deferUpdate();
    }
    return interaction.update({ embeds: [M.nowPlayingEmbed(player, client)], components: M.npRows(player) });
  } catch (error) { return ephemeral(error.message || 'Something went wrong.'); }
}

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('auralis:np:')) return await handleNowPlayingButton(interaction);
    if (!interaction.isChatInputCommand()) return;
    const cmd = registry.get(interaction.commandName);
    if (!cmd) return;
    if (!interaction.guild) return interaction.reply({ embeds: [makeEmbed('Server Only', 'Use Auralis commands inside a server.')], flags: MessageFlags.Ephemeral });
    const blocked = blockedReason(cmd, interaction.guild, interaction.member, interaction.user, interaction.channelId);
    if (blocked) return interaction.reply({ embeds: [makeEmbed('Command Blocked', blocked)], flags: MessageFlags.Ephemeral });
    await interaction.deferReply(cmd.ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    const ctx = fromInteraction({ client, manager, registry, interaction, prefix: settings.getPrefix(interaction.guildId) });
    try { checkAccess(cmd, ctx); await cmd.run(ctx); } catch (error) { await reportError(ctx, error); }
  } catch (error) { console.error(error); }
});

// ---------- prefix commands ----------
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild || !message.content) return;
  const prefix = settings.getPrefix(message.guild.id);
  const content = message.content.trim();
  if (content === `<@${client.user.id}>` || content === `<@!${client.user.id}>`) {
    return message.reply({ embeds: [makeEmbed('Auralis', `My prefix here is \`${prefix}\`. Use \`${prefix}help\` to see all commands.`)], allowedMentions: { repliedUser: false } }).catch(() => {});
  }
  if (!content.startsWith(prefix)) return;
  const [raw, ...args] = content.slice(prefix.length).trim().split(/\s+/);
  const cmd = raw && registry.get(raw);
  if (!cmd) return;
  const blocked = blockedReason(cmd, message.guild, message.member, message.author, message.channelId);
  if (blocked) {
    if (blacklist.has(message.author.id)) return; // blacklisted users are ignored silently
    const sent = await message.reply({ embeds: [makeEmbed('Command Blocked', blocked)] }).catch(() => null);
    return void setTimeout(() => { sent?.delete().catch(() => {}); message.delete().catch(() => {}); }, 6000);
  }
  const ctx = fromMessage({ client, manager, registry, message, args, prefix });
  try { checkAccess(cmd, ctx); await cmd.run(ctx); } catch (error) { await reportError(ctx, error); }
});

process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await closeDatabase(); process.exit(0); });

// The database must be loaded first: server settings, blacklist and 24/7 servers are restored from it.
connectDatabase().then(() => client.login(token)).catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
