// Optional manual re-register: `npm run deploy`. Not needed normally, because src/index.js does this on startup.
require('dotenv').config();
const { loadCommands } = require('./commands');
const { registerSlashCommands } = require('./utils/register');

registerSlashCommands(loadCommands(), { force: true, useCache: false }).catch(error => { console.error(error.message); process.exit(1); });
