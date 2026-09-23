import { createMiddleware } from 'hono/factory';

// Sebelumnya: pool Neon WebSocket per-request (I/O terikat request Workers).
// Turso HTTP / libSQL: client singleton di client.ts — middleware ini no-op.
export const requestDb = createMiddleware(async (_c, next) => {
  await next();
});
