/**
 * Apply Drizzle migrations via @libsql/client (bukan drizzle-kit CLI).
 *
 * Alasan: drizzle-kit@0.31.x di non-TTY (CI) menyembunyikan error di balik
 * spinner ANSI - exit 1 tanpa pesan (drizzle-orm#6121). Runner ini mencetak
 * stack/cause ke stderr.
 *
 * Usage: pnpm db:migrate
 * Env: DATABASE_URL (wajib), DATABASE_AUTH_TOKEN (wajib untuk libsql:// / https://)
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL?.trim() ?? '';
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
const migrationsFolder = resolve(
  process.cwd(),
  'src/shared/database/drizzle/migrations',
);

function fail(message: string, err?: unknown): never {
  console.error(`[db:migrate] ${message}`);
  if (err !== undefined) {
    console.error(err);
    if (err && typeof err === 'object' && 'cause' in err && err.cause) {
      console.error('[db:migrate] cause:', err.cause);
    }
  }
  process.exit(1);
}

if (!url) {
  fail('DATABASE_URL kosong');
}

const isFile = url.startsWith('file:');
const isRemote = url.startsWith('libsql:') || url.startsWith('https:') || url.startsWith('http:');

if (!isFile && !isRemote) {
  fail(`DATABASE_URL tidak dikenali (harus file: / libsql: / http(s):): ${url.slice(0, 32)}…`);
}

if (isRemote && !authToken) {
  fail('DATABASE_AUTH_TOKEN wajib untuk URL remote Turso');
}

console.log(
  `[db:migrate] url=${isFile ? url : url.replace(/^(libsql|https?):\/\//, '$1://***@')}` +
    ` migrations=${migrationsFolder}`,
);

const client = createClient({
  url,
  authToken: isFile ? undefined : authToken,
});

try {
  await client.execute('select 1');
} catch (err) {
  const status =
    err && typeof err === 'object' && 'cause' in err && err.cause && typeof err.cause === 'object' && 'status' in err.cause
      ? Number((err.cause as { status?: number }).status)
      : undefined;
  if (status === 401) {
    fail(
      'Turso menolak auth (HTTP 401). Buat ulang token: `turso db tokens create <db-name>`, lalu update DATABASE_AUTH_TOKEN / secret GitHub TURSO_STAGING_AUTH_TOKEN',
      err,
    );
  }
  fail('Gagal konek ke database (cek URL/token/jaringan)', err);
}

const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder });
  console.log('[db:migrate] OK - migrations applied');
} catch (err) {
  fail('Migrate gagal', err);
} finally {
  client.close();
}
