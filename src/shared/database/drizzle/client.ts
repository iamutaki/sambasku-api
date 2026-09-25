import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { env } from '@/shared/config/env';
import * as schema from './schema';

// Satu-satunya file koneksi DB (api-base-stack.md Section 8).
// Node (dev/test/CI/scripts): @libsql/client - file: lokal ATAU libsql:// remote.
// Cloudflare Workers: @libsql/client/web (fetch-only) lewat dynamic import di bawah.
// Turso HTTP = singleton global (bukan pool per-request Neon WS).

const isCloudflareWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

export type AppDatabase = LibSQLDatabase<typeof schema>;
/** Instance transaction di dalam `db.transaction(async (tx) => …)` */
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

function buildClient(create: typeof createClient): Client {
  return create({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  });
}

const { createClient: create }: { createClient: typeof createClient } = isCloudflareWorkers
  ? await import('@libsql/client/web')
  : { createClient };

export const client = buildClient(create);

// SQLite default: FK mati. Turso remote biasanya ON; set selalu agar lokal/file sama.
await client.execute('PRAGMA foreign_keys = ON');

export const db: AppDatabase = drizzle(client, { schema });

/** Tutup koneksi CLI/scripts (pengganti pool.end pg) */
export async function closeDb(): Promise<void> {
  client.close();
}
