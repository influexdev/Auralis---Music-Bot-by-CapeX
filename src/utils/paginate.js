const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

// Sends embeds with « ‹ 1/3 › » buttons. Only the person who ran the command can flip pages.
async function paginate(ctx, pages, { time = 120000 } = {}) {
  if (pages.length <= 1) return ctx.reply({ embeds: [pages[0]] });
  let index = 0;
  const id = `pg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const button = (key, label, disabled) => new ButtonBuilder().setCustomId(`${id}:${key}`).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  const row = (off = false) => new ActionRowBuilder().addComponents(
    button('first', '«', off || index === 0), button('prev', '‹', off || index === 0),
    button('page', `${index + 1}/${pages.length}`, true),
    button('next', '›', off || index === pages.length - 1), button('last', '»', off || index === pages.length - 1)
  );
  const message = await ctx.reply({ embeds: [pages[0]], components: [row()] });
  if (!message?.createMessageComponentCollector) return message;
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time, filter: i => i.customId.startsWith(`${id}:`) });
  collector.on('collect', async i => {
    if (i.user.id !== ctx.user.id) return i.reply({ content: 'This menu belongs to someone else. Run the command yourself.', flags: MessageFlags.Ephemeral });
    const key = i.customId.split(':')[1];
    if (key === 'first') index = 0; else if (key === 'prev') index = Math.max(0, index - 1);
    else if (key === 'next') index = Math.min(pages.length - 1, index + 1); else if (key === 'last') index = pages.length - 1;
    await i.update({ embeds: [pages[index]], components: [row()] });
  });
  collector.on('end', () => Promise.resolve(ctx.edit({ components: [row(true)] })).catch(() => {}));
  return message;
}

module.exports = { paginate };
