import { createMiddleware } from 'hono/factory';
import type { Pool as NeonPool } from '@neondatabase/serverless';
import { currentRequestPool, runWithRequestDb } from '../database/drizzle/client';

// Workers: WebSocket Neon adalah I/O milik request pembuatnya — tiap request
// mendapat pool sendiri (AsyncLocalStorage di client.ts), ditutup via
// waitUntil SETELAH response terkirim. Di Node middleware ini no-op
// (pool TCP global dipakai bersama, aman lintas request).
const isCloudflareWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

export const requestDb = createMiddleware(async (c, next) => {
  if (!isCloudflareWorkers) {
    await next();
    return;
  }

  // Pool harus ditangkap DI DALAM konteks ALS (getStore kosong setelah keluar).
  // Holder object — supaya TS tidak menyingkat tipe lewat closure-narrowing.
  const poolRef: { current: NeonPool | null } = { current: null };
  await runWithRequestDb(async () => {
    await next();
    poolRef.current = currentRequestPool();
  });

  if (poolRef.current) {
    // response sudah jadi; tutup WS setelah terkirim — jangan tahan isolate
    c.executionCtx.waitUntil(poolRef.current.end().catch(() => {}));
  }
});
