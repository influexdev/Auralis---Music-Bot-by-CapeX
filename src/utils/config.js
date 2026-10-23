// Everything that comes from .env lives here so the rest of the code never touches process.env directly.
function ownerIds() {
  return String(process.env.OWNER_ID || process.env.OWNER_IDS || '')
    .split(/[,\s]+/).map(s => s.trim()).filter(s => /^\d{15,22}$/.test(s));
}
const isOwner = id => ownerIds().includes(String(id));
function supportLink() {
  const link = (process.env.SUPPORT_LINK || '').trim();
  return /^https?:\/\//i.test(link) ? link : null;
}
function supportServerId() {
  const id = (process.env.SUPPORT_SERVER_ID || '').trim();
  return /^\d{15,22}$/.test(id) ? id : null;
}
const geniusKey = () => (process.env.GENIUS_API_KEY || '').trim() || null;
const defaultPrefix = () => process.env.PREFIX || '+';

function inviteUrl(clientId) {
  const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
  const perms = new PermissionsBitField([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.Connect, P.Speak, P.UseExternalEmojis]);
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${perms.bitfield}&scope=bot%20applications.commands`;
}

module.exports = { ownerIds, isOwner, supportLink, supportServerId, geniusKey, defaultPrefix, inviteUrl };
