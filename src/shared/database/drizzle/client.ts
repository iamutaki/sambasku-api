import { Pool as PgPool } from 'pg';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '@/shared/config/env';
import * as schema from './schema';

// Satu-satunya file koneksi DB — ganti provider/adapter cukup ubah ini
// (pola port, api-base-stack.md Section 8).
//
// ADAPTER GANDA PER RUNTIME:
// - Node (dev/test/script CI): driver `pg` TCP — Docker lokal & drizzle-kit.
// - Cloudflare Workers: driver Neon serverless (WebSocket). WebSocket adalah
//   objek I/O MILIK request yang membuatnya ("Cannot perform I/O on behalf
//   of a different request") — jadi di Workers db adalah FACADE per-request
//   via AsyncLocalStorage: middleware membuatkan pool per request, semua
//   import `db` lama tetap bekerja tanpa perubahan di modul lain.
//   (Driver pg/node:net di Workers terbukti flaky ±25% — staging 2026-09-17.)
const isCloudflareWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

let db: NodePgDatabase<typeof schema>;
let pool: { end(): Promise<void> };

type RequestDb = { db: NodePgDatabase<typeof schema>; pool: NeonPool };
const requestDbStorage = new AsyncLocalStorage<RequestDb>();

if (isCloudflareWorkers) {
  // FACADE — setiap akses properti diteruskan ke instance request aktif.
  // Cast tunggal terkontrol: kedua driver identik di query builder/tx runtime.
  db = new Proxy({} as NodePgDatabase<typeof schema>, {
    get(_target, prop) {
      const store = requestDbStorage.getStore();
      if (!store) {
        throw new Error('db diakses di luar scope request — middleware requestDb wajib terpasang');
      }
      return Reflect.get(store.db, prop, store.db);
    },
  }) as NodePgDatabase<typeof schema>;
  pool = { end: () => Promise.resolve() }; // ditutup per-request lewat waitUntil
} else {
  const pgPool = new PgPool({
    connectionString: env.DATABASE_URL,
    // Hardening runtime Node — koneksi setengah-terbuka gagal cepat
    query_timeout: 15_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
    connectionTimeoutMillis: 15_000,
    max: 5,
  });
  db = drizzleNodePg(pgPool, { schema });
  pool = pgPool;
}

/** Dipakai middleware requestDb (Workers): bungkus handler dengan db per-request */
export function runWithRequestDb<T>(fn: () => Promise<T>): Promise<T> {
  const neonPool = new NeonPool({ connectionString: env.DATABASE_URL });
  const store: RequestDb = {
    db: drizzleNeon(neonPool, { schema }) as unknown as NodePgDatabase<typeof schema>,
    pool: neonPool,
  };
  return requestDbStorage.run(store, fn);
}

/** Ditutup setelah response terkirim (waitUntil) supaya WS tidak bocor */
export function currentRequestPool(): NeonPool | null {
  return requestDbStorage.getStore()?.pool ?? null;
}

// pool di-export supaya script CLI (seeder, dst) bisa menutup koneksi dengan bersih
export { pool };
export { db };
