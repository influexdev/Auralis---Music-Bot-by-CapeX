const { geniusKey } = require('./config');

const UA = 'Mozilla/5.0 (compatible; AuralisBot/1.1; +https://discord.com)';
const decode = text => text
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

// Strips "(Official Video)", "[Lyrics]", "ft. X", "- Topic" etc. so searches match better.
function cleanTitle(title = '', author = '') {
  const t = String(title)
    .replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyrics?|lyrical|hd|4k|visualizer|remaster|mv)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*(ft\.?|feat\.?|featuring)\s.*$/i, '')
    .replace(/\s*\|.*$/, '').trim();
  const a = String(author).replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
  return { title: t || title, author: a };
}

// Pull every <div data-lyrics-container="true"> ... </div> out of a Genius page (handles nested divs).
function extractGeniusLyrics(html) {
  const marker = 'data-lyrics-container="true"';
  const parts = []; let idx = 0;
  while ((idx = html.indexOf(marker, idx)) !== -1) {
    const start = html.indexOf('>', idx) + 1;
    const re = /<(\/?)div\b[^>]*>/gi; re.lastIndex = start;
    let depth = 1, m, end = -1;
    while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (depth === 0) { end = m.index; break; } }
    if (end === -1) break;
    parts.push(html.slice(start, end)); idx = end;
  }
  return decode(parts.join('\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fromGenius(query) {
  const key = geniusKey();
  if (!key) return null;
  const data = await getJson(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, { Authorization: `Bearer ${key}` });
  const hit = data?.response?.hits?.find(h => h.type === 'song')?.result;
  if (!hit?.url) return null;
  const res = await fetch(hit.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const lyrics = extractGeniusLyrics(await res.text());
  if (!lyrics) return null;
  return { title: hit.title, artist: hit.primary_artist?.name || 'Unknown artist', url: hit.url, thumbnail: hit.song_art_image_thumbnail_url || hit.header_image_thumbnail_url || null, lyrics, source: 'Genius' };
}

// Free fallback that needs no API key.
async function fromLrclib(query) {
  const data = await getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
  const hit = Array.isArray(data) ? data.find(x => x.plainLyrics) : null;
  if (!hit) return null;
  return { title: hit.trackName, artist: hit.artistName, url: null, thumbnail: null, lyrics: hit.plainLyrics.trim(), source: 'LRCLIB' };
}

async function fetchLyrics(query) {
  for (const provider of [fromGenius, fromLrclib]) {
    try { const found = await provider(query); if (found) return found; }
    catch (error) { console.warn(`[lyrics] ${provider.name} failed: ${error.message}`); }
  }
  return null;
}

module.exports = { fetchLyrics, cleanTitle, extractGeniusLyrics };
