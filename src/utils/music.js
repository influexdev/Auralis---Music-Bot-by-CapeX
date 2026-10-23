const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { makeEmbed } = require('./embed');
const { UserError } = require('./errors');
const { formatDuration, progressBar, truncate, mdEscape, plural } = require('./format');
const { settings } = require('./store');
const filters = require('./filters');
const { E, parseEmoji } = require('./emojis');

const runtime = { timers: new Map(), npMessages: new Map(), silentEnd: new Set() };

// ---------- track helpers ----------
const getCurrent = player => player?.queue?.current || null;
const getQueued = player => player?.queue?.tracks || [];
const titleOf = track => track?.info?.title || 'Unknown track';
const isHttp = url => /^https?:\/\//i.test(url || '');
const titleLink = (track, max = 60) => isHttp(track?.info?.uri) ? `[${truncate(mdEscape(titleOf(track)), max)}](${track.info.uri})` : truncate(mdEscape(titleOf(track)), max);
function artworkOf(track) {
  const info = track?.info || {};
  if (isHttp(info.artworkUrl)) return info.artworkUrl;
  if (/youtube/i.test(info.sourceName || '') && info.identifier) return `https://i.ytimg.com/vi/${info.identifier}/hqdefault.jpg`;
  return null;
}
function requesterText(track, client) {
  const id = track?.requester?.id;
  if (!id) return 'Unknown';
  return id === client?.user?.id ? 'Autoplay' : `<@${id}>`;
}
const totalLength = tracks => tracks.reduce((sum, t) => sum + (t.info?.isStream ? 0 : (t.info?.length || 0)), 0);

// ---------- timers (idle / alone leave) ----------
function clearTimer(kind, guildId) {
  const key = `${kind}:${guildId}`;
  clearTimeout(runtime.timers.get(key)); runtime.timers.delete(key);
}
function setTimer(kind, guildId, ms, fn) {
  clearTimer(kind, guildId);
  runtime.timers.set(`${kind}:${guildId}`, setTimeout(() => { runtime.timers.delete(`${kind}:${guildId}`); fn(); }, ms));
}
function scheduleIdle(manager, guildId, ms = 30000) {
  clearTimer('idle', guildId);
  if (settings.getGuild(guildId).twentyFourSeven) return;
  setTimer('idle', guildId, ms, async () => {
    const player = manager.getPlayer(guildId);
    if (player && !player.playing && !getCurrent(player) && !getQueued(player).length) await player.destroy().catch(() => {});
  });
}
const clearIdle = guildId => clearTimer('idle', guildId);

// ---------- voice / player checks ----------
function assertSameVoice(ctx, player) {
  const vc = ctx.voice;
  if (!vc) throw new UserError('Join a voice channel first.');
  if (player?.connected && player.voiceChannelId && player.voiceChannelId !== vc.id) throw new UserError(`You need to be in <#${player.voiceChannelId}> to use this command.`);
  return vc;
}

async function ensurePlayer(ctx) {
  const { manager, guild } = ctx;
  const vc = ctx.voice;
  if (!vc) throw new UserError('Join a voice channel first.');
  if (!vc.joinable) throw new UserError('I do not have permission to join your voice channel.');
  const cfg = settings.getGuild(guild.id);
  let player = manager.getPlayer(guild.id);
  if (player) assertSameVoice(ctx, player);
  if (!player) {
    player = manager.createPlayer({ guildId: guild.id, voiceChannelId: vc.id, textChannelId: ctx.channelId, selfDeaf: true, volume: cfg.volume ?? 80 });
  } else { player.voiceChannelId = vc.id; player.textChannelId = ctx.channelId; }
  if (!player.connected) await player.connect();
  if (cfg.twentyFourSeven) settings.updateGuild(guild.id, { voiceChannelId: vc.id, textChannelId: ctx.channelId });
  clearIdle(guild.id);
  return player;
}

// ---------- search / queue ----------
// lavalink-client v2 searches through a player (it has no manager.search).
async function resolveQuery(player, query, requester) {
  const res = await player.search({ query: String(query).trim() }, requester);
  if (res.loadType === 'error') throw new UserError(`Could not load that: ${res.exception?.message || 'unknown error'}`);
  if (!res.tracks?.length) throw new UserError('No playable results found. Check the query or Lavalink source plugins.');
  return res;
}
async function queueAndPlay(player, tracks, { next = false } = {}) {
  if (next) await player.queue.add(tracks, 0); else await player.queue.add(tracks);
  if (!player.playing && !player.paused) await player.play();
}

// ---------- playback actions (shared by commands and buttons) ----------
async function pausePlayer(player) {
  if (!getCurrent(player)) throw new UserError('Nothing is playing right now.');
  if (player.paused) throw new UserError('Playback is already paused.');
  await player.pause();
}
async function resumePlayer(player) {
  if (!player.paused) throw new UserError('Playback is not paused.');
  await player.resume();
}
async function skipPlayer(player, to = 0) {
  if (!getCurrent(player)) throw new UserError('Nothing is playing right now.');
  if (to > getQueued(player).length) throw new UserError('That queue position does not exist.');
  if (!getQueued(player).length) await player.skip(0, false); else await player.skip(to > 1 ? to : 0);
}
async function previousPlayer(player) {
  const prev = await player.queue.shiftPrevious();
  if (!prev) throw new UserError('There is no previous track.');
  if (getCurrent(player)) await player.queue.add(getCurrent(player), 0);
  await player.play({ clientTrack: prev });
  return prev;
}
async function stopPlayer(player) {
  runtime.silentEnd.add(player.guildId); setTimeout(() => runtime.silentEnd.delete(player.guildId), 5000);
  await player.stopPlaying(true, false);
}
async function setLoop(player, mode) { await player.setRepeatMode(mode); }
const nextLoopMode = mode => ({ off: 'track', track: 'queue', queue: 'off' }[mode] || 'off');
function normalizeLoop(input) {
  const v = String(input || '').toLowerCase();
  if (['off', 'none', 'disable', 'false', '0'].includes(v)) return 'off';
  if (['track', 'song', 'one', 'single', 'current'].includes(v)) return 'track';
  if (['queue', 'all', 'q'].includes(v)) return 'queue';
  return null;
}

// ---------- now playing embed + controls ----------
function nowPlayingEmbed(player, client, trackOverride) {
  const track = trackOverride || getCurrent(player);
  if (!track) return makeEmbed('Now Playing', 'Nothing is playing right now.');
  const info = track.info || {};
  const length = info.length || 0;
  const live = Boolean(info.isStream);
  const position = Math.max(0, Math.min(player.position || 0, length || 0));
  const bar = live ? `${E.live} **LIVE**` : `${progressBar(position, length)}\n\`${formatDuration(position)} / ${formatDuration(length)}\``;
  const queued = getQueued(player);
  const embed = makeEmbed('Now Playing', `**${titleLink(track, 80)}**\nby **${mdEscape(info.author || 'Unknown artist')}**\n\n${bar}`)
    .addFields(
      { name: 'Requested By', value: requesterText(track, client), inline: true },
      { name: 'Volume', value: `${player.volume ?? 100}%`, inline: true },
      { name: 'Loop', value: { off: 'Off', track: 'Track', queue: 'Queue' }[player.repeatMode] || 'Off', inline: true },
      { name: 'Queue', value: queued.length ? `${plural(queued.length, 'track')} • ${formatDuration(totalLength(queued))}` : 'Empty', inline: true },
      { name: 'Filter', value: filters.PRESETS[filters.activeFilter(player.guildId)]?.label || 'None', inline: true },
      { name: 'Autoplay', value: settings.getGuild(player.guildId).autoplay ? 'On' : 'Off', inline: true }
    );
  if (queued[0]) embed.addFields({ name: 'Up Next', value: `${titleLink(queued[0], 70)} • \`${formatDuration(queued[0].info?.length, queued[0].info?.isStream)}\``, inline: false });
  const art = artworkOf(track);
  if (art) embed.setThumbnail(art);
  return embed;
}
function npRows(player) {
  const b = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`auralis:np:${id}`).setLabel(label).setEmoji(parseEmoji(emoji)).setStyle(style);
  const loop = { off: 'Loop: Off', track: 'Loop: Track', queue: 'Loop: Queue' }[player.repeatMode] || 'Loop: Off';
  return [new ActionRowBuilder().addComponents(
    b('previous', 'Prev', E.previous), b('pause', player.paused ? 'Resume' : 'Pause', player.paused ? E.resume : E.pause),
    b('skip', 'Skip', E.skip), b('loop', loop, E.loop), b('stop', 'Stop', E.stop, ButtonStyle.Danger)
  )];
}
async function announceTrack(client, player, track) {
  const channel = client.channels.cache.get(player.textChannelId);
  if (!channel?.send) return;
  clearNowPlaying(player.guildId);
  const msg = await channel.send({ embeds: [nowPlayingEmbed(player, client, track)], components: npRows(player) }).catch(() => null);
  if (msg) runtime.npMessages.set(player.guildId, msg);
}
function clearNowPlaying(guildId) {
  runtime.npMessages.get(guildId)?.delete().catch(() => {});
  runtime.npMessages.delete(guildId);
}

// ---------- autoplay ----------
async function tryAutoplay(client, player, lastTrack) {
  const seed = lastTrack || player.queue.previous?.[0];
  if (!seed?.info) return false;
  const seen = new Set([seed.info.identifier, ...(player.queue.previous || []).map(t => t.info?.identifier)]);
  const queries = [];
  if (/youtube/i.test(seed.info.sourceName || '') && seed.info.identifier) queries.push(`https://www.youtube.com/watch?v=${seed.info.identifier}&list=RD${seed.info.identifier}`);
  queries.push(`${seed.info.author || ''} ${seed.info.title || ''}`.trim());
  for (const query of queries) {
    try {
      const res = await player.search({ query }, client.user);
      const picks = (res.tracks || []).filter(t => !seen.has(t.info?.identifier)).slice(0, 3);
      if (picks.length) { await player.queue.add(picks); await player.play(); return true; }
    } catch (error) { console.warn('[autoplay]', error.message); }
  }
  return false;
}

module.exports = {
  runtime, getCurrent, getQueued, titleOf, titleLink, artworkOf, requesterText, totalLength, clearIdle, scheduleIdle, setTimer, clearTimer,
  assertSameVoice, ensurePlayer, resolveQuery, queueAndPlay, pausePlayer, resumePlayer, skipPlayer, previousPlayer, stopPlayer, setLoop,
  nextLoopMode, normalizeLoop, nowPlayingEmbed, npRows, announceTrack, clearNowPlaying, tryAutoplay
};
