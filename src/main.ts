import { serve } from '@hono/node-server';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import { app } from './app';

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`API jalan di http://localhost:${info.port} — docs di /docs`);
});
