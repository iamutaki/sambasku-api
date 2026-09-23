import 'dotenv/config'; // .env hanya untuk runtime Node - worker.ts pakai bindings
import { serve } from '@hono/node-server';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import { app } from './app';
import { closeDb } from '@/shared/database/drizzle/client';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`API jalan di http://localhost:${info.port} - docs di /docs`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully...');
  server.close(() => logger.info('HTTP server closed'));
  await closeDb().catch(() => {});
  logger.info('DB client closed');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
