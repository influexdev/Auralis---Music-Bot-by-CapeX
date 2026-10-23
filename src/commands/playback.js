const { makeEmbed } = require('../utils/embed');
const { UserError } = require('../utils/errors');
const { formatDuration, parseTime, truncate, plural, chunkLines } = require('../utils/format');
const { paginate } = require('../utils/paginate');
const { settings } = require('../utils/store');
const filters = require('../utils/filters');
const { fetchLyrics, cleanTitle } = require('../utils/lyrics');
const M = require('../utils/music');

const category = 'Playback';
const needs = { needsVoice: true, needsPlayer: true };
const posInt = (value, name) => { const n = Number(value); if (!Number.isInteger(n) || n < 1) throw new UserError(`Provide a valid ${name}.`); return n; };

async function addToQueue(ctx, { next }) {
  const query = ctx.args.join(' ').trim();
  if (!query) throw new UserError(`Usage: \`${ctx.prefix}${next ? 'playnext' : 'play'} <song name or URL>\``);
  const player = await M.ensurePlayer(ctx);
  let res;
  try { res = await M.resolveQuery(player, query, ctx.user); }
  catch (error) { if (!M.getCurrent(player) && !M.getQueued(player).length) M.scheduleIdle(ctx.manager, ctx.guild.id); throw error; }
  const playlist = res.loadType === 'playlist';
  const tracks = playlist ? res.tracks : [res.tracks[0]];
  const idle = !M.getCurrent(player);
  await M.queueAndPlay(player, tracks, { next });
  if (playlist) {
    return ctx.reply({ embeds: [makeEmbed('Playlist Added', `**${truncate(res.playlist?.title || res.playlist?.name || 'Playlist', 80)}**\nAdded ${plural(tracks.length, 'track')} • \`${formatDuration(M.totalLength(tracks))}\``)] });
  }
  const t = tracks[0];
  const embed = makeEmbed(next ? 'Playing Next' : 'Added to Queue', `**${M.titleLink(t, 80)}**\nAdded to the queue.`)
    .addFields(
      { name: 'Duration', value: `\`${formatDuration(t.info.length, t.info.isStream)}\``, inline: true },
      { name: 'Position', value: idle ? 'Playing now' : next ? '#1' : `#${M.getQueued(player).length}`, inline: true },
      { name: 'Requested By', value: `<@${ctx.user.id}>`, inline: true });
  const art = M.artworkOf(t); if (art) embed.setThumbnail(art);
  return ctx.reply({ embeds: [embed] });
}

module.exports = [
  { name: 'play', aliases: ['p'], category, description: 'Play a song or playlist from a name or URL', usage: ['play <song name or URL>'], examples: ['play lofi hip hop', 'play https://youtu.be/dQw4w9WgXcQ'],
    needsVoice: true, slash: b => b.addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)), run: ctx => addToQueue(ctx, { next: false }) },

  { name: 'playnext', aliases: ['pn', 'playtop'], category, description: 'Add a song to the front of the queue', usage: ['playnext <song name or URL>'], examples: ['playnext blinding lights'],
    needsVoice: true, slash: b => b.addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)), run: ctx => addToQueue(ctx, { next: true }) },

  { name: 'pause', category, description: 'Pause the current track', usage: ['pause'], ...needs,
    run: async ctx => { await M.pausePlayer(ctx.manager.getPlayer(ctx.guild.id)); return ctx.reply({ embeds: [makeEmbed('Paused', 'Playback paused.')] }); } },

  { name: 'resume', aliases: ['unpause'], category, description: 'Resume playback', usage: ['resume'], ...needs,
    run: async ctx => { await M.resumePlayer(ctx.manager.getPlayer(ctx.guild.id)); return ctx.reply({ embeds: [makeEmbed('Resumed', 'Playback resumed.')] }); } },

  { name: 'skip', aliases: ['s', 'next'], category, description: 'Skip the current track', usage: ['skip'], ...needs,
    run: async ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); const t = M.getCurrent(p); await M.skipPlayer(p); return ctx.reply({ embeds: [makeEmbed('Skipped', t ? `Skipped **${M.titleLink(t)}**.` : 'Moving to the next track.')] }); } },

  { name: 'skipto', aliases: ['jump'], category, description: 'Skip to a specific position in the queue', usage: ['skipto <position>'], examples: ['skipto 3'], ...needs,
    slash: b => b.addIntegerOption(o => o.setName('position').setDescription('Queue position, starting at 1').setMinValue(1).setRequired(true)),
    run: async ctx => { const n = posInt(ctx.args[0], 'queue position'); const p = ctx.manager.getPlayer(ctx.guild.id); const t = M.getQueued(p)[n - 1]; await M.skipPlayer(p, n); return ctx.reply({ embeds: [makeEmbed('Skipped', `Jumped to **${M.titleLink(t)}**.`)] }); } },

  { name: 'stop', category, description: 'Stop playback and clear the queue', usage: ['stop'], ...needs,
    run: async ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); await M.stopPlayer(p); M.clearNowPlaying(ctx.guild.id); return ctx.reply({ embeds: [makeEmbed('Stopped', 'Playback stopped and queue cleared.')] }); } },

  { name: 'queue', aliases: ['q', 'list'], category, description: 'Show the current queue', usage: ['queue'], needsPlayer: true,
    run: async ctx => {
      const p = ctx.manager.getPlayer(ctx.guild.id); const cur = M.getCurrent(p); const list = M.getQueued(p);
      const head = cur ? `**Now Playing**\n${M.titleLink(cur, 70)} • \`${formatDuration(cur.info.length, cur.info.isStream)}\`\n\n` : '';
      if (!list.length) return ctx.reply({ embeds: [makeEmbed('Music Queue', `${head}No upcoming tracks are queued.`)] });
      const lines = list.map((t, i) => `\`${i + 1}.\` ${M.titleLink(t, 55)} • \`${formatDuration(t.info.length, t.info.isStream)}\` • ${M.requesterText(t, ctx.client)}`);
      const pages = chunkLines(lines, 3500, 10).map((body, i, all) => makeEmbed('Music Queue', `${i === 0 ? head : ''}**Up Next**\n${body}\n\n${plural(list.length, 'track')} • \`${formatDuration(M.totalLength(list))}\` total`));
      return paginate(ctx, pages);
    } },

  { name: 'previous', aliases: ['prev', 'back'], category, description: 'Play the previous track', usage: ['previous'], ...needs,
    run: async ctx => { const t = await M.previousPlayer(ctx.manager.getPlayer(ctx.guild.id)); return ctx.reply({ embeds: [makeEmbed('Previous Track', `Playing **${M.titleLink(t)}** again.`)] }); } },

  { name: 'replay', aliases: ['restart'], category, description: 'Restart the current track from the beginning', usage: ['replay'], ...needs, needsPlaying: true,
    run: async ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); if (!M.getCurrent(p).info.isSeekable) throw new UserError('This track cannot be restarted.'); await p.seek(0); return ctx.reply({ embeds: [makeEmbed('Replaying', `Restarted **${M.titleLink(M.getCurrent(p))}**.`)] }); } },

  { name: 'nowplaying', aliases: ['np', 'current', 'now'], category, description: 'Show the current track with controls', usage: ['nowplaying'], needsPlayer: true, needsPlaying: true,
    run: ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); return ctx.reply({ embeds: [M.nowPlayingEmbed(p, ctx.client)], components: M.npRows(p) }); } },

  { name: 'volume', aliases: ['vol', 'v'], category, description: 'Show or set the volume (1-200)', usage: ['volume [1-200]'], examples: ['volume 80'], needsPlayer: true,
    slash: b => b.addIntegerOption(o => o.setName('amount').setDescription('Volume 1-200').setMinValue(1).setMaxValue(200)),
    run: async ctx => {
      const p = ctx.manager.getPlayer(ctx.guild.id);
      if (ctx.args[0] === undefined) return ctx.reply({ embeds: [makeEmbed('Volume', `Current volume is **${p.volume}%**.`)] });
      M.assertSameVoice(ctx, p);
      const amount = Number(ctx.args[0]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 200) throw new UserError(`Usage: ${ctx.prefix}volume <1-200>`);
      await p.setVolume(amount); settings.updateGuild(ctx.guild.id, { volume: amount });
      return ctx.reply({ embeds: [makeEmbed('Volume Updated', `Volume set to ${amount}%.${amount > 150 ? '\nHigh volumes can distort the audio.' : ''}`)] });
    } },

  { name: 'shuffle', category, description: 'Shuffle the upcoming queue', usage: ['shuffle'], ...needs,
    run: async ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); if (M.getQueued(p).length < 2) throw new UserError('Need at least 2 queued tracks to shuffle.'); await p.queue.shuffle(); return ctx.reply({ embeds: [makeEmbed('Queue Shuffled', 'The upcoming queue was shuffled.')] }); } },

  { name: 'remove', aliases: ['rm'], category, description: 'Remove a track from the queue', usage: ['remove <position>'], examples: ['remove 2'], ...needs,
    slash: b => b.addIntegerOption(o => o.setName('position').setDescription('Queue position, starting at 1').setMinValue(1).setRequired(true)),
    run: async ctx => {
      const n = posInt(ctx.args[0], 'queue position'); const p = ctx.manager.getPlayer(ctx.guild.id); const t = M.getQueued(p)[n - 1];
      if (!t) throw new UserError('That queue position does not exist.');
      await p.queue.splice(n - 1, 1); return ctx.reply({ embeds: [makeEmbed('Track Removed', `Removed **${M.titleLink(t)}**.`)] });
    } },

  { name: 'clear', aliases: ['clearqueue', 'cq'], category, description: 'Clear all upcoming tracks from the queue', usage: ['clear [queue]'], ...needs,
    run: async ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); const n = M.getQueued(p).length; if (!n) throw new UserError('The queue is already empty.'); await p.queue.splice(0, n); return ctx.reply({ embeds: [makeEmbed('Queue Cleared', `Removed ${plural(n, 'upcoming track')}.`)] }); } },

  { name: 'loop', aliases: ['repeat'], category, description: 'Set loop mode: off, track or queue', usage: ['loop <off|track|queue>'], examples: ['loop queue'], ...needs,
    slash: b => b.addStringOption(o => o.setName('mode').setDescription('Loop mode (leave empty to cycle)').addChoices({ name: 'Off', value: 'off' }, { name: 'Track', value: 'track' }, { name: 'Queue', value: 'queue' })),
    run: async ctx => {
      const p = ctx.manager.getPlayer(ctx.guild.id);
      const mode = ctx.args[0] ? M.normalizeLoop(ctx.args[0]) : M.nextLoopMode(p.repeatMode);
      if (!mode) throw new UserError(`Usage: ${ctx.prefix}loop <off|track|queue>`);
      await M.setLoop(p, mode); return ctx.reply({ embeds: [makeEmbed('Loop Updated', `Loop mode: **${mode}**.`)] });
    } },

  { name: 'seek', aliases: ['goto'], category, description: 'Seek to a position in the current track', usage: ['seek <seconds>'], examples: ['seek 90', 'seek 1:30'], ...needs, needsPlaying: true,
    slash: b => b.addStringOption(o => o.setName('seconds').setDescription('Seconds or mm:ss, e.g. 90 or 1:30').setRequired(true)),
    run: async ctx => {
      const p = ctx.manager.getPlayer(ctx.guild.id); const t = M.getCurrent(p); const secs = parseTime(ctx.args[0]);
      if (secs === null) throw new UserError(`Usage: ${ctx.prefix}seek <seconds> (e.g. 90 or 1:30)`);
      if (t.info.isStream || !t.info.isSeekable) throw new UserError('This track cannot be seeked.');
      if (secs * 1000 >= t.info.length) throw new UserError(`That is past the end of the track (\`${formatDuration(t.info.length)}\`).`);
      await p.seek(secs * 1000); return ctx.reply({ embeds: [makeEmbed('Seek Updated', `Moved to ${formatDuration(secs * 1000)}.`)] });
    } },

  { name: 'join', aliases: ['summon', 'connect'], category, description: 'Join your voice channel', usage: ['join'], needsVoice: true,
    run: async ctx => { await M.ensurePlayer(ctx); return ctx.reply({ embeds: [makeEmbed('Connected', `Joined **${ctx.voice.name}**.`)] }); } },

  { name: 'leave', aliases: ['disconnect', 'dc'], category, description: 'Leave the voice channel', usage: ['leave'], ...needs,
    run: async ctx => { const p = ctx.manager.getPlayer(ctx.guild.id); await p.destroy(); return ctx.reply({ embeds: [makeEmbed('Disconnected', 'Left the voice channel.')] }); } },

  { name: 'filters', aliases: ['filterlist'], category, description: 'Show all available audio filters', usage: ['filters'],
    run: ctx => {
      const active = filters.activeFilter(ctx.guild.id);
      const lines = Object.entries(filters.PRESETS).map(([k, f]) => `${k === active ? '**▸** ' : ''}\`${ctx.prefix}filter apply ${k}\` — **${f.label}**: ${f.description}`);
      return ctx.reply({ embeds: [makeEmbed('Audio Filters', `${lines.join('\n')}\n\nReset with \`${ctx.prefix}filter reset\`.\nActive: **${filters.PRESETS[active]?.label || 'None'}**`)] });
    } },

  { name: 'filter', aliases: ['fx'], category, description: 'Apply or reset an audio filter', usage: ['filter apply <name>', 'filter reset'], examples: ['filter apply nightcore', 'filter reset'], needsVoice: true, needsPlayer: true,
    subcommands: [{ name: 'apply', usage: '<name>', description: 'Change the song filter (nightcore, slowed, speedrun, bassboost, electronic, karaoke)' }, { name: 'reset', usage: '', description: 'Reset the song to normal' }],
    slash: b => b
      .addSubcommand(s => s.setName('apply').setDescription('Change the song filter').addStringOption(o => o.setName('name').setDescription('Filter name').setRequired(true).addChoices(...Object.entries(filters.PRESETS).map(([value, f]) => ({ name: f.label, value })))))
      .addSubcommand(s => s.setName('reset').setDescription('Reset the song to normal')),
    run: async ctx => {
      const p = ctx.manager.getPlayer(ctx.guild.id); const sub = (ctx.args[0] || '').toLowerCase();
      if (!sub) return ctx.reply({ embeds: [makeEmbed('Audio Filters', `Use \`${ctx.prefix}filter apply <name>\` or \`${ctx.prefix}filter reset\`. See \`${ctx.prefix}filters\` for the list.`)] });
      if (sub === 'reset') { await filters.resetFilters(p); return ctx.reply({ embeds: [makeEmbed('Filter Reset', 'Audio is back to normal.')] }); }
      const key = filters.resolveFilter(sub === 'apply' ? ctx.args.slice(1).join(' ') : ctx.args.join(' '));
      if (!key) throw new UserError(`Unknown filter. Available: ${Object.keys(filters.PRESETS).map(k => `\`${k}\``).join(', ')}`);
      await filters.applyFilter(p, key);
      return ctx.reply({ embeds: [makeEmbed('Filter Applied', `**${filters.PRESETS[key].label}** is now active.\n${filters.PRESETS[key].description}.`)] });
    } },

  { name: 'lyrics', aliases: ['ly'], category, description: 'Get lyrics for the current track or a specific song', usage: ['lyrics [song name]'], examples: ['lyrics', 'lyrics blinding lights the weeknd'],
    slash: b => b.addStringOption(o => o.setName('query').setDescription('Song name (leave empty for the current track)')),
    run: async ctx => {
      let query = ctx.args.join(' ').trim();
      if (!query) {
        const cur = M.getCurrent(ctx.manager.getPlayer(ctx.guild.id));
        if (!cur) throw new UserError(`Nothing is playing. Use \`${ctx.prefix}lyrics <song name>\`.`);
        const c = cleanTitle(cur.info.title, cur.info.author); query = `${c.title} ${c.author}`.trim();
      }
      const found = await fetchLyrics(query);
      if (!found) throw new UserError(`No lyrics found for **${truncate(query, 80)}**.`);
      const bodies = chunkLines(found.lyrics.split('\n'), 3800);
      const pages = bodies.map((body, i) => {
        const e = makeEmbed(truncate(`${found.title} — ${found.artist}`, 250), `${body}${i === bodies.length - 1 ? `\n\n*Source: ${found.source}*` : ''}`);
        if (found.url) e.setURL(found.url); if (found.thumbnail) e.setThumbnail(found.thumbnail); return e;
      });
      return paginate(ctx, pages);
    } }
];
