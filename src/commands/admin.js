const { makeEmbed } = require('../utils/embed');
const { UserError } = require('../utils/errors');
const { truncate, chunkLines, plural, mdEscape } = require('../utils/format');
const { paginate } = require('../utils/paginate');
const { parseId } = require('../utils/permissions');
const { blacklist } = require('../utils/store');
const { isOwner } = require('../utils/config');

const category = 'Bot Admin';

module.exports = [
  { name: 'blacklist', aliases: ['bl'], category, description: 'Bot owner: block users from using the bot', usage: ['blacklist add <user> [reason]', 'blacklist remove <user>', 'blacklist list'], ownerOnly: true,
    subcommands: [{ name: 'add', usage: '<user mention or id> [reason]', description: 'Add a user to the blacklist for bot commands' }, { name: 'remove', usage: '<user mention or id>', description: 'Remove a user from the blacklist' }, { name: 'list', usage: '', description: 'Show all blacklisted users' }],
    slash: b => b
      .addSubcommand(s => s.setName('add').setDescription('Blacklist a user from bot commands').addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a user from the blacklist').addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Show all blacklisted users')),
    run: async ctx => {
      const sub = (ctx.args[0] || '').toLowerCase();
      if (sub === 'list') {
        const all = blacklist.all();
        if (!all.length) return ctx.reply({ embeds: [makeEmbed('Blacklist', 'No users are blacklisted.')] });
        const lines = all.map(([id, e]) => `<@${id}> (\`${id}\`) — ${truncate(mdEscape(e.reason || 'No reason'), 60)}`);
        return paginate(ctx, chunkLines(lines, 3500, 15).map(body => makeEmbed('Blacklist', `${body}\n\n${plural(all.length, 'user')}`)));
      }
      if (sub !== 'add' && sub !== 'remove') throw new UserError(`Usage: \`${ctx.prefix}blacklist <add|remove|list> <user mention or id>\``);
      const id = parseId(ctx.args[1]);
      if (!id) throw new UserError('Provide a valid user mention or user ID.');
      if (sub === 'remove') {
        if (!blacklist.remove(id)) throw new UserError('That user is not blacklisted.');
        return ctx.reply({ embeds: [makeEmbed('Blacklist Updated', `<@${id}> can use Auralis again.`)] });
      }
      if (id === ctx.client.user.id || isOwner(id)) throw new UserError('You cannot blacklist the bot or a bot owner.');
      if (blacklist.has(id)) throw new UserError('That user is already blacklisted.');
      const user = await ctx.client.users.fetch(id).catch(() => null);
      if (!user) throw new UserError('I could not find a Discord user with that ID.');
      const reason = ctx.args.slice(2).join(' ').trim() || null;
      blacklist.add(id, { reason, by: ctx.user.id, at: Date.now() });
      return ctx.reply({ embeds: [makeEmbed('Blacklist Updated', `**${mdEscape(user.username)}** (<@${id}>) can no longer use Auralis.${reason ? `\nReason: ${truncate(mdEscape(reason), 200)}` : ''}`)] });
    } },

  { name: 'server', aliases: ['servers', 'guild'], category, description: 'Bot owner: list servers or make the bot leave one', usage: ['server leave <server id> [reason]', 'server list'], ownerOnly: true,
    subcommands: [{ name: 'leave', usage: '<server id> [reason]', description: 'Bot leaves the server and DMs the server owner' }, { name: 'list', usage: '', description: 'List servers the bot is in' }],
    slash: b => b
      .addSubcommand(s => s.setName('leave').setDescription('Leave a server and DM its owner').addStringOption(o => o.setName('id').setDescription('Server ID').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
      .addSubcommand(s => s.setName('list').setDescription('List servers the bot is in')),
    run: async ctx => {
      const sub = (ctx.args[0] || '').toLowerCase();
      if (sub === 'list') {
        const guilds = [...ctx.client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
        const lines = guilds.map((g, i) => `\`${i + 1}.\` **${truncate(mdEscape(g.name), 40)}** (\`${g.id}\`) • ${g.memberCount.toLocaleString()} members`);
        return paginate(ctx, chunkLines(lines, 3500, 15).map(body => makeEmbed('Servers', `${body}\n\n${plural(guilds.length, 'server')}`)));
      }
      if (sub !== 'leave') throw new UserError(`Usage: \`${ctx.prefix}server leave <server id> [reason]\``);
      const id = parseId(ctx.args[1]);
      const guild = id && ctx.client.guilds.cache.get(id);
      if (!guild) throw new UserError('I am not in a server with that ID. Use `server list` to see all servers.');
      const reason = ctx.args.slice(2).join(' ').trim();
      const owner = await guild.fetchOwner().catch(() => null);
      const dm = owner ? await owner.send({ embeds: [makeEmbed('Auralis Left Your Server', `The bot owner told me to leave **${mdEscape(guild.name)}**.${reason ? `\nReason: ${truncate(mdEscape(reason), 300)}` : ''}`)] }).then(() => true).catch(() => false) : false;
      await ctx.manager.getPlayer(guild.id)?.destroy().catch(() => {});
      await guild.leave();
      return ctx.reply({ embeds: [makeEmbed('Left Server', `Left **${mdEscape(guild.name)}** (\`${guild.id}\`).\nServer owner DM: ${dm ? 'sent' : 'could not be delivered'}.`)] }).catch(() => {});
    } }
];
