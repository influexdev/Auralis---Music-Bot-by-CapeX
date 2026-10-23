const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { makeEmbed } = require('../utils/embed');
const { levenshtein, truncate } = require('../utils/format');
const { isOwner, supportLink, inviteUrl } = require('../utils/config');
const { E, parseEmoji } = require('../utils/emojis');

const CATEGORY_LIST = require('./index.js').CATEGORIES;

const visibleCategories = ctx => CATEGORY_LIST.filter(c => !c.ownerOnly || isOwner(ctx.user.id));
const commandsOf = (ctx, name) => ctx.registry.inCategory(name);
const countOf = (ctx, name) => commandsOf(ctx, name).reduce((n, c) => n + (c.subcommands?.length || 1), 0);

function requirements(cmd) {
  const r = [];
  if (cmd.ownerOnly) r.push('Bot owner only');
  if (cmd.adminOnly) r.push('Manage Server permission');
  if (cmd.needsVoice) r.push('You must be in a voice channel');
  if (cmd.needsPlayer && !cmd.needsVoice) r.push('Requires an active player');
  return r;
}

function homeEmbed(ctx) {
  const cats = visibleCategories(ctx);
  const total = cats.reduce((n, c) => n + countOf(ctx, c.name), 0);
  // Custom emoji do not render in embed field names or titles, so categories live in the description.
  const sections = cats.map(c => `${c.emoji} **${c.name}** [${countOf(ctx, c.name)}]\n${truncate(commandsOf(ctx, c.name).map(x => `\`${x.name}\``).join(' '), 900)}`);
  return makeEmbed('Auralis | Help',
    `Hey <@${ctx.user.id}>, I'm **Auralis**, a high-quality music bot.\n` +
    `Prefix: \`${ctx.prefix}\` • Slash commands: \`/\` — both work everywhere.\n\n` +
    `**Quick Start**\n` +
    `\`${ctx.prefix}play <song or URL>\` — start the music\n` +
    `\`${ctx.prefix}queue\` • \`${ctx.prefix}nowplaying\` • \`${ctx.prefix}filters\` • \`${ctx.prefix}lyrics\`\n\n` +
    `${sections.join('\n\n')}\n\n` +
    `Pick a category from the menu below, or use \`${ctx.prefix}help <command>\` for details, usage and examples.\n` +
    `**${total}** commands in **${cats.length}** categories.`);
}

function categoryEmbed(ctx, name) {
  const cat = CATEGORY_LIST.find(c => c.name === name);
  const lines = [];
  for (const cmd of commandsOf(ctx, name)) {
    if (cmd.subcommands?.length) for (const s of cmd.subcommands) lines.push(`\`${ctx.prefix}${cmd.name} ${s.name}${s.usage ? ` ${s.usage}` : ''}\` — ${s.description}`);
    else lines.push(`\`${ctx.prefix}${cmd.usage[0]}\` — ${cmd.description}`);
  }
  return makeEmbed(`Auralis | ${name}`, `${cat.emoji} *${cat.description}*\n\n${lines.join('\n')}\n\n\`<>\` required • \`[]\` optional`);
}

function commandEmbed(ctx, cmd) {
  const embed = makeEmbed(`Auralis | ${cmd.name}`, `${cmd.description}.`);
  embed.addFields({ name: 'Usage', value: cmd.usage.map(u => `\`${ctx.prefix}${u}\``).join('\n') });
  if (cmd.subcommands?.length) embed.addFields({ name: 'Subcommands', value: truncate(cmd.subcommands.map(s => `\`${s.name}${s.usage ? ` ${s.usage}` : ''}\` — ${s.description}`).join('\n'), 1000) });
  if (cmd.aliases?.length) embed.addFields({ name: 'Aliases', value: cmd.aliases.map(a => `\`${ctx.prefix}${a}\``).join(', '), inline: true });
  embed.addFields({ name: 'Slash', value: `\`/${cmd.name}\``, inline: true }, { name: 'Category', value: cmd.category, inline: true });
  if (cmd.examples?.length) embed.addFields({ name: 'Examples', value: cmd.examples.map(e => `\`${ctx.prefix}${e}\``).join('\n') });
  const req = requirements(cmd);
  if (req.length) embed.addFields({ name: 'Requirements', value: req.map(r => `• ${r}`).join('\n') });
  return embed;
}

function suggestion(ctx, query) {
  const names = ctx.registry.names().filter(n => isOwner(ctx.user.id) || !ctx.registry.get(n).ownerOnly);
  const close = names.filter(n => n.startsWith(query) || levenshtein(n, query) <= 2).slice(0, 4);
  return makeEmbed('Auralis | Help', `I couldn't find a command called \`${truncate(query, 30)}\`.${close.length ? `\nDid you mean: ${close.map(c => `\`${c}\``).join(', ')}?` : ''}\nUse \`${ctx.prefix}help\` to browse every command.`);
}

function menuRow(ctx, selected) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('auralis:help:menu').setPlaceholder('Choose a command category')
    .addOptions({ label: 'Home', value: 'home', emoji: parseEmoji(E.home), description: 'Overview of everything Auralis can do', default: selected === 'home' },
      ...visibleCategories(ctx).map(c => ({ label: c.name, value: c.name, emoji: parseEmoji(c.emoji), description: truncate(`${countOf(ctx, c.name)} commands • ${c.description}`, 100), default: selected === c.name }))));
}
function linkRow(ctx) {
  const row = new ActionRowBuilder();
  row.addComponents(new ButtonBuilder().setCustomId('auralis:help:home').setLabel('Home').setStyle(ButtonStyle.Secondary));
  const support = supportLink();
  if (support) row.addComponents(new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL(support));
  row.addComponents(new ButtonBuilder().setLabel('Invite Auralis').setStyle(ButtonStyle.Link).setURL(inviteUrl(ctx.client.user.id)));
  return row;
}

module.exports = [{
  name: 'help', aliases: ['h', 'commands', 'menu'], category: 'Information', description: 'Get information about commands and the help menu',
  usage: ['help [command or category]'], examples: ['help', 'help play', 'help playlist'],
  slash: b => b.addStringOption(o => o.setName('command').setDescription('Command or category to look up')),
  run: async ctx => {
    const query = ctx.args.join(' ').trim().toLowerCase();
    let selected = 'home', embed;
    if (query) {
      const cat = visibleCategories(ctx).find(c => c.name.toLowerCase() === query);
      const cmd = ctx.registry.get(query.replace(/^[^\w]*/, '').split(/\s+/)[0]) || ctx.registry.get(query);
      if (cat) { selected = cat.name; embed = categoryEmbed(ctx, cat.name); }
      else if (cmd && (!cmd.ownerOnly || isOwner(ctx.user.id))) { selected = cmd.category; embed = commandEmbed(ctx, cmd); }
      else return ctx.reply({ embeds: [suggestion(ctx, query)] });
    } else embed = homeEmbed(ctx);

    const message = await ctx.reply({ embeds: [embed], components: [menuRow(ctx, selected), linkRow(ctx)] });
    if (!message?.createMessageComponentCollector) return;
    const collector = message.createMessageComponentCollector({ time: 180000, filter: i => i.customId.startsWith('auralis:help:') });
    collector.on('collect', async i => {
      if (i.user.id !== ctx.user.id) return i.reply({ content: `This menu belongs to someone else. Use \`${ctx.prefix}help\` to open your own.`, flags: MessageFlags.Ephemeral });
      const choice = i.componentType === ComponentType.StringSelect ? i.values[0] : 'home';
      const next = choice === 'home' ? homeEmbed(ctx) : categoryEmbed(ctx, choice);
      await i.update({ embeds: [next], components: [menuRow(ctx, choice), linkRow(ctx)] });
      collector.resetTimer();
    });
    collector.on('end', () => Promise.resolve(ctx.edit({ components: [] })).catch(() => {}));
  }
}];
