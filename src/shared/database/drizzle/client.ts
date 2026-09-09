import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/shared/config/env';
import * as schema from './schema';

// Satu-satunya file koneksi DB — ganti provider cukup ubah ini + DATABASE_URL
// (api-base-stack.md Section 8: driver generik `pg`, bukan driver eksklusif Neon)
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// pool di-export supaya script CLI (seeder, dst) bisa menutup koneksi dengan bersih
export { pool };

export const db = drizzle(pool, { schema });
