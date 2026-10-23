// One "ctx" object shape for BOTH prefix commands and slash commands, so every command is written once.
const NO_MENTIONS = { parse: [], repliedUser: false };

function fromMessage({ client, manager, registry, message, args, prefix }) {
  let first = null;
  return {
    isSlash: false, client, manager, registry, prefix, args, message,
    guild: message.guild, member: message.member, user: message.author, channel: message.channel, channelId: message.channelId,
    createdTimestamp: message.createdTimestamp,
    get voice() { return this.member?.voice?.channel || null; },
    async reply(payload) {
      const body = { ...payload, allowedMentions: NO_MENTIONS };
      const sent = await message.reply(body).catch(() => message.channel.send(body));
      first ??= sent;
      return sent;
    },
    edit: payload => first?.edit(payload),
    send: payload => message.channel.send({ ...payload, allowedMentions: NO_MENTIONS })
  };
}

// Turns slash options into the same args array a prefix command would get:
// /playlist play name:Chill  ->  ['play', 'Chill']
function slashArgs(options) {
  const out = [];
  for (const opt of options || []) {
    if (opt.type === 1 || opt.type === 2) { out.push(opt.name, ...slashArgs(opt.options)); continue; } // subcommand / group
    out.push(String(opt.value));
  }
  return out;
}

function fromInteraction({ client, manager, registry, interaction, prefix }) {
  let replied = false;
  return {
    isSlash: true, client, manager, registry, prefix, interaction,
    args: slashArgs(interaction.options.data),
    guild: interaction.guild, member: interaction.member, user: interaction.user, channel: interaction.channel, channelId: interaction.channelId,
    createdTimestamp: interaction.createdTimestamp,
    get voice() { return this.member?.voice?.channel || null; },
    async reply(payload) {
      const body = { ...payload, allowedMentions: NO_MENTIONS };
      if (!replied) { replied = true; return interaction.editReply(body); }
      return interaction.followUp(body);
    },
    edit: payload => interaction.editReply(payload),
    send: async payload => {
      const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
      return channel.send({ ...payload, allowedMentions: NO_MENTIONS });
    }
  };
}

module.exports = { fromMessage, fromInteraction, slashArgs };
