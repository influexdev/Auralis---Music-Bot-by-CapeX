const { makeEmbed } = require('../utils/embed');
const { UserError } = require('../utils/errors');
const { formatDuration, truncate, plural, chunkLines, mdEscape } = require('../utils/format');
const { paginate } = require('../utils/paginate');
const { playlists } = require('../utils/store');
const M = require('../utils/music');

const MAX_PLAYLISTS = 10, MAX_TRACKS = 200;
const serialize = t => ({ encoded: t.encoded, pluginInfo: t.pluginInfo || {}, info: { identifier: t.info.identifier, title: t.info.title, author: t.info.author, length: t.info.length, artworkUrl: t.info.artworkUrl, uri: t.info.uri, sourceName: t.info.sourceName, isSeekable: t.info.isSeekable, isStream: t.info.isStream, isrc: t.info.isrc } });
const lengthOf = list => list.reduce((s, t) => s + (t.info.isStream ? 0 : t.info.length || 0), 0);

// Rebuild a stored track; if the stored data is rejected, fall back to searching its URL.
async function revive(manager, player, raw, requester) {
  try { return manager.utils.buildTrack({ encoded: raw.encoded, info: raw.info, pluginInfo: raw.pluginInfo || {}, userData: {} }, requester); }
  catch { const res = await player.search({ query: raw.info.uri || raw.info.title }, requester).catch(() => null); return res?.tracks?.[0] || null; }
}
function nameOf(args) {
  const name = args.join(' ').trim();
  if (!name) throw new UserError('Provide a playlist name.');
  if (name.length > 32) throw new UserError('Playlist names can be at most 32 characters.');
  return name;
}
const nameOption = b => b.addStringOption(o => o.setName('name').setDescription('Playlist name').setMaxLength(32).setRequired(true));

module.exports = [{
  name: 'playlist', aliases: ['pl', 'playlists'], category: 'Playlist', description: 'Manage your personal playlists',
  usage: ['playlist <create|delete|list|play|save|view|add> [name]'], examples: ['playlist create Gym', 'playlist save Gym', 'playlist play Gym'],
  subcommands: [
    { name: 'create', usage: '<name>', description: 'Create a new empty playlist' },
    { name: 'delete', usage: '<name>', description: 'Delete a playlist' },
    { name: 'list', usage: '', description: 'View all your playlists' },
    { name: 'play', usage: '<name>', description: 'Load a playlist into the queue' },
    { name: 'save', usage: '<name>', description: 'Save the current queue as a new playlist' },
    { name: 'view', usage: '<name>', description: 'See the tracks inside a playlist' },
    { name: 'add', usage: '<name>', description: 'Add the current track to a playlist' }
  ],
  slash: b => b
    .addSubcommand(s => nameOption(s.setName('create').setDescription('Create a new empty playlist')))
    .addSubcommand(s => nameOption(s.setName('delete').setDescription('Delete a playlist')))
    .addSubcommand(s => s.setName('list').setDescription('View all your playlists'))
    .addSubcommand(s => nameOption(s.setName('play').setDescription('Load a playlist into the queue')))
    .addSubcommand(s => nameOption(s.setName('save').setDescription('Save the current queue as a new playlist')))
    .addSubcommand(s => nameOption(s.setName('view').setDescription('See the tracks inside a playlist')))
    .addSubcommand(s => nameOption(s.setName('add').setDescription('Add the current track to a playlist'))),
  run: async ctx => {
    const sub = (ctx.args[0] || '').toLowerCase(); const rest = ctx.args.slice(1); const uid = ctx.user.id;
    const need = async name => { const pl = await playlists.get(uid, name); if (!pl) throw new UserError(`You do not have a playlist named **${truncate(name, 40)}**.`); return pl; };
    switch (sub) {
      case 'create': {
        const name = nameOf(rest);
        if (await playlists.get(uid, name)) throw new UserError(`You already have a playlist named **${name}**.`);
        if ((await playlists.all(uid)).length >= MAX_PLAYLISTS) throw new UserError(`You can have at most ${MAX_PLAYLISTS} playlists.`);
        await playlists.set(uid, { name, tracks: [], createdAt: Date.now() });
        return ctx.reply({ embeds: [makeEmbed('Playlist Created', `Created empty playlist **${mdEscape(name)}**.\nAdd songs with \`${ctx.prefix}playlist add ${name}\` or \`${ctx.prefix}playlist save <name>\`.`)] });
      }
      case 'delete': case 'remove': {
        const pl = await need(nameOf(rest)); await playlists.delete(uid, pl.name);
        return ctx.reply({ embeds: [makeEmbed('Playlist Deleted', `Deleted **${mdEscape(pl.name)}** (${plural(pl.tracks.length, 'track')}).`)] });
      }
      case 'list': {
        const all = await playlists.all(uid);
        if (!all.length) return ctx.reply({ embeds: [makeEmbed('Your Playlists', `You have no playlists yet. Create one with \`${ctx.prefix}playlist create <name>\`.`)] });
        const lines = all.map((p, i) => `\`${i + 1}.\` **${mdEscape(p.name)}** — ${plural(p.tracks.length, 'track')} • \`${formatDuration(lengthOf(p.tracks))}\``);
        return paginate(ctx, chunkLines(lines, 3500, 10).map(body => makeEmbed('Your Playlists', `${body}\n\n${all.length}/${MAX_PLAYLISTS} playlists`)));
      }
      case 'view': {
        const pl = await need(nameOf(rest));
        if (!pl.tracks.length) return ctx.reply({ embeds: [makeEmbed(`Playlist | ${truncate(pl.name, 40)}`, 'This playlist is empty.')] });
        const lines = pl.tracks.map((t, i) => `\`${i + 1}.\` ${truncate(mdEscape(t.info.title), 55)} • \`${formatDuration(t.info.length, t.info.isStream)}\``);
        return paginate(ctx, chunkLines(lines, 3500, 15).map(body => makeEmbed(`Playlist | ${truncate(pl.name, 40)}`, `${body}\n\n${plural(pl.tracks.length, 'track')} • \`${formatDuration(lengthOf(pl.tracks))}\``)));
      }
      case 'save': {
        const name = nameOf(rest); const player = ctx.manager.getPlayer(ctx.guild.id);
        const tracks = [M.getCurrent(player), ...M.getQueued(player)].filter(Boolean);
        if (!tracks.length) throw new UserError('The queue is empty, there is nothing to save.');
        if (await playlists.get(uid, name)) throw new UserError(`You already have a playlist named **${name}**. Delete it first or pick another name.`);
        if ((await playlists.all(uid)).length >= MAX_PLAYLISTS) throw new UserError(`You can have at most ${MAX_PLAYLISTS} playlists.`);
        const kept = tracks.slice(0, MAX_TRACKS);
        await playlists.set(uid, { name, tracks: kept.map(serialize), createdAt: Date.now() });
        return ctx.reply({ embeds: [makeEmbed('Playlist Saved', `Saved **${mdEscape(name)}** with ${plural(kept.length, 'track')}.${tracks.length > kept.length ? `\nOnly the first ${MAX_TRACKS} tracks were saved.` : ''}`)] });
      }
      case 'add': {
        const pl = await need(nameOf(rest)); const cur = M.getCurrent(ctx.manager.getPlayer(ctx.guild.id));
        if (!cur) throw new UserError('Nothing is playing right now.');
        if (pl.tracks.length >= MAX_TRACKS) throw new UserError(`Playlists can hold at most ${MAX_TRACKS} tracks.`);
        pl.tracks.push(serialize(cur)); await playlists.set(uid, pl);
        return ctx.reply({ embeds: [makeEmbed('Track Added', `Added **${M.titleLink(cur)}** to **${mdEscape(pl.name)}**.`)] });
      }
      case 'play': case 'load': {
        const pl = await need(nameOf(rest));
        if (!pl.tracks.length) throw new UserError('This playlist is empty.');
        if (!ctx.voice) throw new UserError('Join a voice channel first.');
        const player = await M.ensurePlayer(ctx);
        const tracks = (await Promise.all(pl.tracks.map(t => revive(ctx.manager, player, t, ctx.user)))).filter(Boolean);
        if (!tracks.length) throw new UserError('None of the tracks in this playlist could be loaded.');
        await M.queueAndPlay(player, tracks);
        return ctx.reply({ embeds: [makeEmbed('Playlist Loaded', `Loaded **${mdEscape(pl.name)}** — ${plural(tracks.length, 'track')} added to the queue.`)] });
      }
      default:
        throw new UserError(`Usage: \`${ctx.prefix}playlist <create|delete|list|play|save|view|add> [name]\``);
    }
  }
}];
