// ============================================================================
//  AURALIS EMOJIS - the only file you need to edit to change emojis.
//
//  Put your custom emoji inside CUSTOM below. To get the exact text of a custom emoji,
//  type a backslash before it in Discord, e.g.  \:white_musicnote:  and send it.
//  Discord shows something like  <:white_musicnote:123456789012345678>
//  (animated emojis look like  <a:name:123456789012345678>). Paste THAT whole text.
//
//  Notes:
//   - Plain  :name:  text does NOT work for bots, you must use the <:name:id> format.
//   - The emoji must be from a server the bot is in, and the bot needs "Use External Emojis"
//     permission if it is used in another server (the invite link already asks for it).
//   - Leave a value empty ('') to keep the default emoji.
// ============================================================================
const CUSTOM = {
  // ----- help menu categories -----
  playback: '<:white_musicnote:1562806424344723597>',      // Playback category
  information: '<:white_exclm:1562807086054903829>',   // Information category
  playlist: '<:Opened_Folder:1562807325776023626>',      // Playlist category
  config: '<:config:1562815009023856640>',        // Config category
  botAdmin: '<:white_people:1562807328388948009>',      // Bot Admin category
  home: '<:home:1562813179791413268>',          // "Home" entry in the help menu

  // ----- now playing buttons -----
  previous: '<:white_back:1562820071636602920>',
  pause: '<:pause:1562820109700042822>',
  resume: '<:resume:1562820597183152200>',
  skip: '<:white_next:1562820094038515764>',
  loop: '<:loop:1562820828066750575>',
  stop: '<:stop:1562821094136619030>',

  // ----- now playing embed -----
  live: '<a:live:1562822191240712402>',          // shown for live streams
  progressBar: '<:dots:1562822941224468482>',   // the filled/empty line of the progress bar (use a small emoji)
  progressKnob: '<:white_time:1562822599380050121>'   // the dot showing the current position
};

// ----------------------------------------------------------------------------
const DEFAULTS = {
  playback: '🎵', information: 'ℹ️', playlist: '📁', config: '⚙️', botAdmin: '🛡️', home: '🏠',
  previous: '⏮', pause: '⏸', resume: '▶️', skip: '⏭', loop: '🔁', stop: '⏹',
  live: '🔴', progressBar: '▬', progressKnob: '🔘'
};

const CUSTOM_FORMAT = /^<a?:\w{2,32}:\d{15,22}>$/;
const SHORTCODE = /^:\w+:$/;
const EMOJIS = {};
for (const key of Object.keys(DEFAULTS)) {
  const value = String(CUSTOM[key] || '').trim();
  if (!value) { EMOJIS[key] = DEFAULTS[key]; continue; }
  if (SHORTCODE.test(value)) {
    console.warn(`[emojis] "${key}" is set to ${value}, which Discord bots cannot render. Use the <:name:id> format instead. Using the default emoji.`);
    EMOJIS[key] = DEFAULTS[key];
  } else EMOJIS[key] = value;
}

// For buttons / select menus: Discord wants {id, name, animated} for custom emoji, or the plain character.
function parseEmoji(text) {
  const m = String(text).match(/^<(a?):(\w{2,32}):(\d{15,22})>$/);
  return m ? { id: m[3], name: m[2], animated: m[1] === 'a' } : text;
}

module.exports = { ...EMOJIS, E: EMOJIS, parseEmoji, CUSTOM_FORMAT };
