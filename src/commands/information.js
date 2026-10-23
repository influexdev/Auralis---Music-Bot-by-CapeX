const { ChannelType, PermissionFlagsBits } = require('discord.js');
const discord = require('discord.js');
const { makeEmbed } = require('../utils/embed');
const { UserError } = require('../utils/errors');
const { formatDuration, plural } = require('../utils/format');
const cfg = require('../utils/config');

const category = 'Information';
const inviteCache = new Map();

async function supportUrl(client) {
  const link = cfg.supportLink(); if (link) return link;
  const id = cfg.supportServerId(); if (!id) return null;
  if (inviteCache.has(id)) return inviteCache.get(id);
  const guild = client.guilds.cache.get(id); if (!guild) return null;
  const me = guild.members.me;
  const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
  if (!channel) return null;
  const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'Auralis support command' }).catch(() => null);
  if (invite) inviteCache.set(id, invite.url);
  return invite?.url || null;
}

module.exports = [
  { name: 'ping', category, description: 'Check the bot latency', usage: ['ping'], ephemeral: true,
    run: async ctx => {
      const node = ctx.manager.nodeManager?.leastUsedNodes?.()?.[0] || [...(ctx.manager.nodeManager?.nodes?.values?.() || [])][0];
      const embed = makeEmbed('Pong', `WebSocket latency: ${ctx.client.ws.ping} ms`).addFields(
        { name: 'Response Time', value: `${Math.max(0, Date.now() - ctx.createdTimestamp)} ms`, inline: true },
        { name: 'Lavalink', value: node?.connected ? `${node.heartBeatPing ?? node.ping ?? '?'} ms` : 'Offline', inline: true });
      return ctx.reply({ embeds: [embed] });
    } },

  { name: 'stats', aliases: ['botinfo', 'statistics'], category, description: 'Show bot statistics', usage: ['stats'], ephemeral: true,
    run: async ctx => {
      const { client, manager } = ctx;
      const users = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
      const owners = cfg.ownerIds();
      const ownerUser = owners[0] ? await client.users.fetch(owners[0]).catch(() => null) : null;
      const players = manager.players?.size ?? 0;
      const playing = [...(manager.players?.values?.() || [])].filter(p => p.playing).length;
      const embed = makeEmbed('Auralis Statistics').addFields(
        { name: 'Servers', value: String(client.guilds.cache.size), inline: true },
        { name: 'Users', value: users.toLocaleString(), inline: true },
        { name: 'Ping', value: `${client.ws.ping} ms`, inline: true },
        { name: 'Players', value: `${players} active • ${playing} playing`, inline: true },
        { name: 'Uptime', value: formatDuration(client.uptime || 0), inline: true },
        { name: 'Memory', value: `${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB`, inline: true },
        { name: 'Bot Owner', value: ownerUser ? `${ownerUser.username} (<@${ownerUser.id}>)` : owners[0] ? `<@${owners[0]}>` : 'Not configured', inline: true },
        { name: 'Library', value: `discord.js v${discord.version}`, inline: true },
        { name: 'Runtime', value: `Node ${process.version}`, inline: true });
      return ctx.reply({ embeds: [embed] });
    } },

  { name: 'support', category, description: 'Get the support server invite', usage: ['support'],
    run: async ctx => {
      const url = await supportUrl(ctx.client);
      if (!url) throw new UserError('The support server is not configured yet. The bot owner needs to set SUPPORT_LINK or SUPPORT_SERVER_ID in .env.');
      return ctx.reply({ embeds: [makeEmbed('Support Server', `Need help or want to report a bug?\nJoin the support server: ${url}`)] });
    } },

  { name: 'invite', category, description: 'Get the link to add Auralis to your server', usage: ['invite'],
    run: ctx => ctx.reply({ embeds: [makeEmbed('Invite Auralis', `[Click here to add Auralis to your server](${cfg.inviteUrl(ctx.client.user.id)})`)] }) },

  { name: 'about', category, description: 'About Auralis', usage: ['about'], ephemeral: true,
    run: ctx => ctx.reply({ embeds: [makeEmbed('About Auralis', `A Discord music bot built with Discord.js and Lavalink.\nServing ${plural(ctx.client.guilds.cache.size, 'server')}. Use \`${ctx.prefix}help\` to see everything it can do.`)] }) }
];
