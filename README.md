# Auralis Music Bot

Auralis is a JavaScript Discord music bot built with discord.js v14 and `lavalink-client` 2.10.3. Every command works as a **slash command** and as a **prefix command**, with per-server prefixes, black embeds, an interactive help menu and now-playing controls.

## Requirements
- Node.js 20 or newer (22 LTS recommended)
- A Discord application and bot token (enable **Message Content Intent** for prefix commands)
- An online Lavalink v4 server with the source plugins you want (YouTube, Spotify via LavaSrc, ...)

## Setup & starting
1. Copy `.env.example` to `.env` and fill it in (token, client id, MongoDB, Lavalink, `OWNER_ID`, ...).
2. `npm install`
3. Start the bot: `node src/index.js` (or `npm start`). On hosting panels set the startup/main file to `src/index.js`.

That is all. On every start Auralis connects to MongoDB, restores 24/7 voice channels, logs in and **registers its slash commands automatically** (it skips the Discord API call if nothing changed). With `GUILD_ID` set, commands appear instantly in that server; without it they are global and can take a few minutes the first time.
`npm run deploy` is only an optional manual re-register.

Invite with the `bot` + `applications.commands` scopes (`+invite` gives a ready link once the bot is running).

## .env reference
| Key | Purpose |
|---|---|
| `OWNER_ID` | Bot owner user id (comma separated for several). Unlocks `blacklist` and `server`. |
| `SUPPORT_LINK` | Invite link shown by `support` and the help menu button. |
| `SUPPORT_SERVER_ID` | Alternative: a server the bot is in; an invite is created automatically. |
| `MONGODB_URI` | MongoDB connection string (required). `MONGODB_DB` sets the database name (default `auralis`). |
| `GENIUS_API_KEY` | Genius token for `lyrics`. Without it lyrics fall back to LRCLIB (no key needed). |

## Commands
Prefix shown as `+`. Use `+help` or `+help <command>` inside Discord.

**Playback** — `play`, `playnext`, `pause`, `resume`, `skip`, `skipto`, `stop`, `queue`, `previous`, `replay`, `nowplaying` (rich embed with buttons), `volume <1-200>`, `shuffle`, `remove <position>`, `clear`, `loop <off|track|queue>`, `seek <seconds|mm:ss>`, `join`, `leave`, `filters`, `filter apply <name>`, `filter reset`, `lyrics [song]`

Filters: nightcore, slowed, speedrun, bassboost, electronic, karaoke.

**Information** — `help`, `ping`, `stats`, `support`, `invite`, `about`

**Playlist** — `playlist create|delete|list|play|save|view|add`

**Config** — `24/7`, `prefix`, `autoplay`, `command channel set|clear|show` (alias `commandchannel`), `config`, `setup`

**Bot Admin (owner only)** — `blacklist add|remove|list`, `server leave <id> [reason]` (DMs the server owner), `server list`

## Notes
- Everything persistent is stored in MongoDB: server settings (prefix, 24/7, autoplay, command channel, volume), the blacklist and playlists. The bot will not start without `MONGODB_URI`.
- 24/7 mode stays connected when the queue is empty and rejoins its saved voice channel after every restart or crash. Without it the bot leaves 30s after the queue ends, or 60s after everyone leaves.
- Autoplay queues similar tracks when the queue ends (uses the YouTube mix for YouTube tracks).
- Filters use Lavalink's built-in timescale/equalizer/karaoke filters.
- `LAVALINK_HOST` must be a hostname only, without `https://`.
