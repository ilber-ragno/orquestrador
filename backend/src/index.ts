import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { startWatchdog, stopWatchdog } from './services/watchdog.service.js';
import { startSessionPoller, stopSessionPoller } from './services/session-poller.service.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Clawd backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  startWatchdog();
  startSessionPoller();
});

process.on('SIGTERM', () => { stopWatchdog(); stopSessionPoller(); });
process.on('SIGINT', () => { stopWatchdog(); stopSessionPoller(); });
