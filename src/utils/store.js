const { MongoClient } = require('mongodb');
const { defaultPrefix } = require('./config');

// Everything persistent lives in MongoDB. Small collections (server settings, blacklist) are cached in
// memory at startup so command checks stay instant; writes go to MongoDB in the background.
let client = null, db = null;
const guildCache = new Map();     // guildId -> settings
const blacklistCache = new Map(); // userId  -> { reason, by, at }

const DEFAULTS = { prefix: null, twentyFourSeven: false, autoplay: false, commandChannel: null, voiceChannelId: null, textChannelId: null, volume: 80 };
const logErr = what => error => console.error(`[mongo] ${what} failed:`, error.message);

async function connectDatabase() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri || uri.startsWith('YOUR_')) throw new Error('Set MONGODB_URI in your .env file.');
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
  } catch (error) {
    // Some networks/ISPs block the DNS SRV lookup that mongodb+srv:// needs. Retry once with public DNS servers.
    if (!/querySrv|ECONNREFUSED|ENOTFOUND|ETIMEOUT/i.test(error.message) || !uri.startsWith('mongodb+srv://')) throw error;
    console.warn('DNS lookup for MongoDB failed, retrying with public DNS (1.1.1.1 / 8.8.8.8)...');
    require('node:dns').setServers(['1.1.1.1', '8.8.8.8']);
    await client?.close().catch(() => {});
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
  }
  db = client.db((process.env.MONGODB_DB || 'auralis').trim());
  await db.collection('playlists').createIndex({ userId: 1, key: 1 }, { unique: true });

  for (const doc of await db.collection('guilds').find({}).toArray()) { const { _id, ...rest } = doc; guildCache.set(_id, rest); }
  for (const doc of await db.collection('blacklist').find({}).toArray()) { const { _id, ...rest } = doc; blacklistCache.set(_id, rest); }
  console.log(`MongoDB connected (${guildCache.size} server configs, ${blacklistCache.size} blacklisted users loaded).`);
}
async function closeDatabase() { await client?.close().catch(() => {}); }

// ---- per-server settings ----
const settings = {
  getGuild: id => ({ ...DEFAULTS, ...(guildCache.get(id) || {}) }),
  getPrefix: id => guildCache.get(id)?.prefix || defaultPrefix(),
  updateGuild(id, patch) {
    guildCache.set(id, { ...(guildCache.get(id) || {}), ...patch });
    db.collection('guilds').updateOne({ _id: id }, { $set: patch }, { upsert: true }).catch(logErr('saving server settings'));
  },
  entries: () => [...guildCache.entries()].map(([id, cfg]) => [id, { ...DEFAULTS, ...cfg }])
};

// ---- bot blacklist ----
const blacklist = {
  has: userId => blacklistCache.has(userId),
  get: userId => blacklistCache.get(userId) || null,
  add(userId, entry) {
    blacklistCache.set(userId, entry);
    db.collection('blacklist').replaceOne({ _id: userId }, entry, { upsert: true }).catch(logErr('saving blacklist'));
  },
  remove(userId) {
    const had = blacklistCache.delete(userId);
    if (had) db.collection('blacklist').deleteOne({ _id: userId }).catch(logErr('removing from blacklist'));
    return had;
  },
  all: () => [...blacklistCache.entries()]
};

// ---- user playlists (async, read straight from MongoDB) ----
const keyOf = name => String(name).trim().toLowerCase();
const stripId = ({ _id, ...rest }) => rest;
const playlists = {
  all: userId => db.collection('playlists').find({ userId }).sort({ createdAt: 1 }).toArray(),
  get: (userId, name) => db.collection('playlists').findOne({ userId, key: keyOf(name) }),
  async set(userId, playlist) {
    const doc = { ...stripId(playlist), userId, key: keyOf(playlist.name), updatedAt: Date.now() };
    await db.collection('playlists').replaceOne({ userId, key: doc.key }, doc, { upsert: true });
  },
  async delete(userId, name) { return (await db.collection('playlists').deleteOne({ userId, key: keyOf(name) })).deletedCount > 0; }
};

// ---- small key/value area for bot internals (e.g. slash command hash) ----
const getMeta = id => db.collection('meta').findOne({ _id: id });
const setMeta = (id, data) => db.collection('meta').replaceOne({ _id: id }, data, { upsert: true });

module.exports = { getMeta, setMeta, connectDatabase, closeDatabase, settings, blacklist, playlists };
