const { E } = require('./emojis');
const pad = n => String(n).padStart(2, '0');

function formatDuration(ms, isStream = false) {
  if (isStream) return 'LIVE';
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// "90", "1:30", "1:02:03", "1m30s" -> seconds (or null if invalid)
function parseTime(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  if (/^\d+(:\d{1,2}){1,2}$/.test(text)) return text.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
  const m = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return null;
}

function progressBar(position, length, size = 16) {
  if (!length || length <= 0) return E.progressBar.repeat(size + 1);
  const filled = Math.min(size, Math.max(0, Math.round((position / length) * size)));
  return E.progressBar.repeat(filled) + E.progressKnob + E.progressBar.repeat(size - filled);
}

const truncate = (text, max) => { const s = String(text ?? ''); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };
const mdEscape = text => String(text ?? '').replace(/([\[\]\\*_`~|>])/g, '\\$1');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Split lines into chunks that fit into one embed description.
function chunkLines(lines, maxChars = 3800, maxLines = Infinity) {
  const pages = []; let current = [], size = 0;
  for (const line of lines) {
    if (current.length && (size + line.length + 1 > maxChars || current.length >= maxLines)) { pages.push(current.join('\n')); current = []; size = 0; }
    current.push(line); size += line.length + 1;
  }
  if (current.length) pages.push(current.join('\n'));
  return pages;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

module.exports = { formatDuration, parseTime, progressBar, truncate, mdEscape, plural, chunkLines, levenshtein };
