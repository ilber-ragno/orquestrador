import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { generalLimiter } from './middleware/rate-limiter.js';
import { routes } from './routes/index.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(requestId());
  app.use(generalLimiter);

  app.use('/api', routes);
  app.use(errorHandler);

  return app;
}
