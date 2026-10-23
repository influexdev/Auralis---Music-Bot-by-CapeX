const { E } = require('../utils/emojis');

const CATEGORIES = [
  { name: 'Playback', emoji: E.playback, description: 'Play, control and tune your music' },
  { name: 'Information', emoji: E.information, description: 'Help, latency, stats and support' },
  { name: 'Playlist', emoji: E.playlist, description: 'Save and load your own playlists' },
  { name: 'Config', emoji: E.config, description: 'Server settings: prefix, 24/7, autoplay' },
  { name: 'Bot Admin', emoji: E.botAdmin, description: 'Owner-only bot management', ownerOnly: true }
];

function loadCommands() {
  const list = [...require('./playback'), ...require('./help'), ...require('./information'), ...require('./playlist'), ...require('./config'), ...require('./admin')];
  const map = new Map();
  for (const cmd of list) {
    if (!/^[\w-]{1,32}$/.test(cmd.name)) throw new Error(`Invalid command name: ${cmd.name}`);
    if (cmd.description.length > 100) throw new Error(`Description too long for ${cmd.name}`);
    if (!CATEGORIES.some(c => c.name === cmd.category)) throw new Error(`Unknown category for ${cmd.name}`);
    for (const key of [cmd.name, ...(cmd.aliases || [])]) {
      if (map.has(key)) throw new Error(`Duplicate command name/alias: ${key}`);
      map.set(key, cmd);
    }
  }
  return {
    list, categories: CATEGORIES,
    get: name => map.get(String(name).toLowerCase()) || null,
    names: () => [...map.keys()],
    inCategory: name => list.filter(c => c.category === name)
  };
}

module.exports = { CATEGORIES, loadCommands };
