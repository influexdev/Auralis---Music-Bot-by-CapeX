const { PermissionFlagsBits } = require('discord.js');

const isAdmin = member => Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));

// Accepts <@123>, <@!123>, <#123>, <@&123> or a raw id.
function parseId(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^<[@#!&]*(\d{15,22})>$/) || String(input).trim().match(/^(\d{15,22})$/);
  return m ? m[1] : null;
}

module.exports = { isAdmin, parseId };
