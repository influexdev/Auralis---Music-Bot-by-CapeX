const { ChannelType } = require('discord.js');
const { makeEmbed } = require('../utils/embed');
const { UserError } = require('../utils/errors');
const { settings } = require('../utils/store');
const { isAdmin, parseId } = require('../utils/permissions');
const cfg = require('../utils/config');
const M = require('../utils/music');

const category = 'Config';
const onOff = (v, fallback) => { const s = String(v ?? '').toLowerCase(); if (['on', 'enable', 'true', 'yes', '1'].includes(s)) return true; if (['off', 'disable', 'false', 'no', '0'].includes(s)) return false; return fallback; };
const requireAdmin = ctx => { if (!isAdmin(ctx.member)) throw new UserError('Manage Server permission is required.', 'Permission Required'); };

module.exports = [
  { name: '247', aliases: ['24/7', '24x7', 'stay'], category, description: 'Keep the bot in your voice channel 24/7', usage: ['24/7 [on|off]'], examples: ['24/7', '24/7 off'], adminOnly: true,
    slash: b => b.addStringOption(o => o.setName('mode').setDescription('On or off (leave empty to toggle)').addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })),
    run: async ctx => {
      const current = settings.getGuild(ctx.guild.id).twentyFourSeven;
      const enable = onOff(ctx.args[0], !current);
      if (enable) {
        const existing = ctx.manager.getPlayer(ctx.guild.id);
        if (!ctx.voice && !existing?.voiceChannelId) throw new UserError('Join a voice channel and run this command again so I know where to stay.');
        settings.updateGuild(ctx.guild.id, { twentyFourSeven: true });
        const player = await M.ensurePlayer(ctx);
        settings.updateGuild(ctx.guild.id, { voiceChannelId: player.voiceChannelId, textChannelId: ctx.channelId });
        return ctx.reply({ embeds: [makeEmbed('24/7 Enabled', `I will stay in <#${player.voiceChannelId}> even when the queue is empty, and rejoin after restarts.`)] });
      }
      settings.updateGuild(ctx.guild.id, { twentyFourSeven: false });
      const player = ctx.manager.getPlayer(ctx.guild.id);
      if (player && !player.playing) M.scheduleIdle(ctx.manager, ctx.guild.id, 30000);
      return ctx.reply({ embeds: [makeEmbed('24/7 Disabled', 'I will leave the voice channel when the queue ends or everyone leaves.')] });
    } },

  { name: 'prefix', category, description: 'View or change the prefix for this server', usage: ['prefix', 'prefix set <new prefix>', 'prefix reset'], examples: ['prefix set !'], ephemeral: true,
    subcommands: [{ name: 'show', usage: '', description: 'Show the current prefix' }, { name: 'set', usage: '<new prefix>', description: 'Set the prefix of the bot for this server' }, { name: 'reset', usage: '', description: 'Reset to the default prefix' }],
    slash: b => b
      .addSubcommand(s => s.setName('show').setDescription('Show current prefix'))
      .addSubcommand(s => s.setName('set').setDescription('Set a new prefix').addStringOption(o => o.setName('value').setDescription('1-5 characters, no spaces').setMinLength(1).setMaxLength(5).setRequired(true)))
      .addSubcommand(s => s.setName('reset').setDescription('Reset to the default prefix')),
    run: async ctx => {
      let sub = (ctx.args[0] || 'show').toLowerCase(); let value = ctx.args[1];
      if (!['show', 'set', 'reset'].includes(sub)) { value = ctx.args[0]; sub = 'set'; }
      if (sub === 'show') return ctx.reply({ embeds: [makeEmbed('Server Prefix', `Current prefix: \`${ctx.prefix}\``)] });
      requireAdmin(ctx);
      if (sub === 'reset') { settings.updateGuild(ctx.guild.id, { prefix: null }); return ctx.reply({ embeds: [makeEmbed('Prefix Reset', `This server prefix is now \`${cfg.defaultPrefix()}\`.`)] }); }
      if (!value || value.length > 5 || /\s/.test(value)) throw new UserError('Use a prefix of 1–5 characters with no spaces.', 'Invalid Prefix');
      settings.updateGuild(ctx.guild.id, { prefix: value });
      return ctx.reply({ embeds: [makeEmbed('Prefix Updated', `This server prefix is now \`${value}\`.`)] });
    } },

  { name: 'autoplay', aliases: ['ap'], category, description: 'Keep similar songs playing when the queue ends', usage: ['autoplay [on|off]'], examples: ['autoplay on'],
    slash: b => b.addStringOption(o => o.setName('mode').setDescription('On or off (leave empty to toggle)').addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })),
    run: async ctx => {
      const enable = onOff(ctx.args[0], !settings.getGuild(ctx.guild.id).autoplay);
      settings.updateGuild(ctx.guild.id, { autoplay: enable });
      return ctx.reply({ embeds: [makeEmbed('Autoplay Updated', `Autoplay is now **${enable ? 'on' : 'off'}**.${enable ? '\nWhen the queue ends I will queue similar tracks (depends on your Lavalink sources).' : ''}`)] });
    } },

  { name: 'commandchannel', aliases: ['command', 'cc', 'cmdchannel'], category, description: 'Restrict bot commands to one channel (admins only)', usage: ['command channel set [#channel]', 'command channel clear', 'command channel'], examples: ['command channel set #music'],
    subcommands: [{ name: 'set', usage: '[#channel]', description: 'Only allow commands in a channel (server admin only)' }, { name: 'clear', usage: '', description: 'Allow commands everywhere again' }, { name: 'show', usage: '', description: 'Show the current command channel' }],
    slash: b => b
      .addSubcommand(s => s.setName('set').setDescription('Only allow commands in a channel').addChannelOption(o => o.setName('channel').setDescription('Defaults to the current channel').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand(s => s.setName('clear').setDescription('Allow commands in every channel'))
      .addSubcommand(s => s.setName('show').setDescription('Show the current command channel')),
    run: async ctx => {
      const args = [...ctx.args]; if ((args[0] || '').toLowerCase() === 'channel') args.shift();
      const sub = (args[0] || 'show').toLowerCase(); const current = settings.getGuild(ctx.guild.id).commandChannel;
      if (sub === 'show') return ctx.reply({ embeds: [makeEmbed('Command Channel', current ? `Commands are restricted to <#${current}>.` : 'Commands work in every channel.')] });
      requireAdmin(ctx);
      if (['clear', 'reset', 'off', 'remove'].includes(sub)) { settings.updateGuild(ctx.guild.id, { commandChannel: null }); return ctx.reply({ embeds: [makeEmbed('Command Channel Cleared', 'Commands now work in every channel.')] }); }
      if (sub !== 'set') throw new UserError(`Usage: \`${ctx.prefix}command channel set [#channel]\` or \`${ctx.prefix}command channel clear\``);
      const id = parseId(args[1]) || ctx.channelId; const channel = ctx.guild.channels.cache.get(id);
      if (!channel || channel.type !== ChannelType.GuildText) throw new UserError('Pick a text channel in this server.');
      settings.updateGuild(ctx.guild.id, { commandChannel: id });
      return ctx.reply({ embeds: [makeEmbed('Command Channel Set', `Commands are now restricted to <#${id}>. Admins can still use commands anywhere.`)] });
    } },

  { name: 'config', aliases: ['settings'], category, description: 'Show this server configuration', usage: ['config'], ephemeral: true,
    run: ctx => {
      const s = settings.getGuild(ctx.guild.id);
      return ctx.reply({ embeds: [makeEmbed('Server Configuration', `Prefix: \`${ctx.prefix}\`\n24/7: **${s.twentyFourSeven ? 'On' : 'Off'}**\nAutoplay: **${s.autoplay ? 'On' : 'Off'}**\nCommand channel: ${s.commandChannel ? `<#${s.commandChannel}>` : 'Any channel'}\nDefault volume: **${s.volume}%**\nLavalink host: ${process.env.LAVALINK_HOST || 'Not set'}`)] });
    } },

  { name: 'setup', category, description: 'Show setup instructions', usage: ['setup'], ephemeral: true,
    run: ctx => ctx.reply({ embeds: [makeEmbed('Setup', '1. Fill in `.env`.\n2. Start your Lavalink server.\n3. Run `npm run deploy`.\n4. Start Auralis with `npm start`.')] }) }
];
