// Filter presets built on lavalink-client's FilterManager (timescale / equalizer / karaoke).
const bands = gains => gains.map((gain, band) => ({ band, gain }));

const PRESETS = {
  nightcore: { label: 'Nightcore', description: 'Faster tempo with a higher pitch', apply: async fm => { await fm.setSpeed(1.2); await fm.setPitch(1.25); } },
  slowed: { label: 'Slowed', description: 'Slower and deeper for a chill, slowed feel', apply: async fm => { await fm.setSpeed(0.85); await fm.setPitch(0.9); } },
  speedrun: { label: 'Speedrun', description: 'Much faster playback speed', apply: async fm => { await fm.setSpeed(1.5); await fm.setPitch(1.05); } },
  bassboost: { label: 'Bass Boost', description: 'Heavy low-end boost', aliases: ['bass', 'bass-boost', 'bass boost'], apply: fm => fm.setEQ(bands([0.35, 0.3, 0.25, 0.15, 0.1, 0.05])) },
  electronic: { label: 'Electronic', description: 'Punchy highs and lows tuned for EDM', apply: fm => fm.setEQ(bands([0.375, 0.35, 0.125, 0, 0, -0.125, -0.125, 0, 0.25, 0.125, 0.15, 0.2, 0.25, 0.35, 0.4])) },
  karaoke: { label: 'Karaoke', description: 'Reduces vocals so you can sing along', apply: fm => fm.toggleKaraoke() }
};

const norm = s => String(s || '').toLowerCase().replace(/[\s_-]+/g, '');
function resolveFilter(input) {
  const wanted = norm(input);
  if (!wanted) return null;
  return Object.keys(PRESETS).find(key => key === wanted || (PRESETS[key].aliases || []).some(a => norm(a) === wanted)) || null;
}

const active = new Map(); // guildId -> filter key

async function applyFilter(player, key) {
  const fm = player.filterManager;
  await fm.resetFilters();
  await PRESETS[key].apply(fm);
  active.set(player.guildId, key);
}
async function resetFilters(player) { await player.filterManager.resetFilters(); active.delete(player.guildId); }
const activeFilter = guildId => active.get(guildId) || null;
const forgetFilter = guildId => active.delete(guildId);

module.exports = { PRESETS, resolveFilter, applyFilter, resetFilters, activeFilter, forgetFilter };
