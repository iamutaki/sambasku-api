import { config as loadEnv } from 'dotenv';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { AppDatabase } from './client';
import * as schema from './schema';

// Khusus integration & e2e test (api-base-stack.md Section 10):
// DATABASE_URL HARUS mengarah ke database test terpisah lewat .env.test
// (file:./test.db). override:true - .env.test selalu menang.
loadEnv({ path: '.env.test', quiet: true, override: true });

let testDb: AppDatabase | undefined;
let ready: Promise<void> | undefined;

export function getTestDb(): AppDatabase {
  if (!testDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL test tidak ada - copy .env.test.example ke .env.test (file:./test.db)',
      );
    }
    const client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    });
    testDb = drizzle(client, { schema });
    // FK on + busy_timeout supaya truncateAll paralel-ish tidak SQLITE_BUSY
    ready = (async () => {
      await client.execute('PRAGMA foreign_keys = ON');
      await client.execute('PRAGMA busy_timeout = 5000');
      await client.execute('PRAGMA journal_mode = WAL');
    })();
  }
  return testDb;
}

/** Panggil di beforeAll jika perlu menunggu pragma selesai. */
export async function ensureTestDbReady(): Promise<AppDatabase> {
  const db = getTestDb();
  await ready;
  return db;
}
