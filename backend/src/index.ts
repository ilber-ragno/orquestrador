import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Clawd backend running on port ${env.PORT} [${env.NODE_ENV}]`);
});
