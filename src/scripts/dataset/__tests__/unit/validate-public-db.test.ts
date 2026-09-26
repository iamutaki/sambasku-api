import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PUBLIC_SCHEMA_DDL } from '../../public-schema-v1';
import { validatePublicDb } from '../../validate-public-db';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function openTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'sambasku-ds-'));
  tempDirs.push(dir);
  const path = join(dir, 'public.sqlite');
  const client = createClient({ url: `file:${path}` });
  await client.executeMultiple(PUBLIC_SCHEMA_DDL);
  return client;
}

describe('validatePublicDb', () => {
  it('lolos schema kosong + meta schema_version=1', async () => {
    const client = await openTempDb();
    await client.execute({
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['schema_version', '1'],
    });
    await client.execute({
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['release_version', '1'],
    });
    await client.execute({
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['released_at', new Date().toISOString()],
    });

    const result = await validatePublicDb(client);
    client.close();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wordCount).toBe(0);
      expect(result.schemaVersion).toBe(1);
    }
  });

  it('gagal jika ada tabel users', async () => {
    const client = await openTempDb();
    await client.execute({
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['schema_version', '1'],
    });
    await client.execute(
      `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT)`,
    );

    const result = await validatePublicDb(client);
    client.close();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('users'))).toBe(true);
    }
  });

  it('gagal jika ada kolom created_by', async () => {
    const client = await openTempDb();
    await client.execute({
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['schema_version', '1'],
    });
    await client.execute(`ALTER TABLE words ADD COLUMN created_by TEXT`);

    const result = await validatePublicDb(client);
    client.close();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('created_by'))).toBe(true);
    }
  });
});
