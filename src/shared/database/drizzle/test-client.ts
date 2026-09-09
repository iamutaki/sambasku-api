import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Khusus integration & e2e test (api-base-stack.md Section 10):
// DATABASE_URL HARUS mengarah ke database test terpisah lewat .env.test.
// override:true — .env.test selalu menang atas .env dev / env shell.
loadEnv({ path: '.env.test', quiet: true, override: true });

let testDb: NodePgDatabase<typeof schema> | undefined;

// Lazy — supaya file ini aman di-import walau test di-skip (tanpa DB test)
export function getTestDb(): NodePgDatabase<typeof schema> {
  if (!testDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL test tidak ada — copy .env.example ke .env.test, arahkan ke DB test');
    }
    testDb = drizzle(new Pool({ connectionString: url }), { schema });
  }
  return testDb;
}
