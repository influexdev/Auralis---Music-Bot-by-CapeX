const { EmbedBuilder } = require('discord.js');

// Same embed style Auralis always used: black accent, "Auralis" footer, timestamp.
function makeEmbed(title, description = '\u200b') {
  return new EmbedBuilder().setColor(0x000000).setTitle(title).setDescription(description).setFooter({ text: 'Auralis' }).setTimestamp();
}

module.exports = { makeEmbed };
