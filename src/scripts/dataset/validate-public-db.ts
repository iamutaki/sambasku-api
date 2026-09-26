import type { Client } from '@libsql/client';

import {
  ALLOWED_TABLES,
  FORBIDDEN_COLUMNS,
  FORBIDDEN_TABLES,
  PUBLIC_SCHEMA_VERSION,
} from './public-schema-v1';

export type ValidatePublicDbResult =
  | {
      ok: true;
      wordCount: number;
      schemaVersion: number;
    }
  | {
      ok: false;
      errors: string[];
    };

/**
 * Validasi artifact publik: integrity, allowlist tabel, forbidden kolom, FTS smoke.
 */
export async function validatePublicDb(client: Client): Promise<ValidatePublicDbResult> {
  const errors: string[] = [];

  const integrity = await client.execute('PRAGMA integrity_check');
  const integrityValue = String(integrity.rows[0]?.integrity_check ?? integrity.rows[0]?.[0] ?? '');
  if (integrityValue !== 'ok') {
    errors.push(`integrity_check gagal: ${integrityValue || JSON.stringify(integrity.rows)}`);
  }

  const tablesResult = await client.execute(
    `SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`,
  );
  const tableNames = tablesResult.rows.map((r) => String(r.name ?? r[0]));

  for (const name of tableNames) {
    if (name.startsWith('words_fts')) continue;
    if (!(ALLOWED_TABLES as readonly string[]).includes(name)) {
      errors.push(`tabel tidak di allowlist: ${name}`);
    }
  }

  for (const forbidden of FORBIDDEN_TABLES) {
    if (tableNames.includes(forbidden)) {
      errors.push(`tabel terlarang ada: ${forbidden}`);
    }
  }

  for (const table of tableNames) {
    if (table.startsWith('words_fts')) continue;
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      errors.push(`nama tabel tidak aman: ${table}`);
      continue;
    }
    const cols = await client.execute(`PRAGMA table_info("${table}")`);
    for (const col of cols.rows) {
      const colName = String(col.name ?? col[1] ?? '');
      if ((FORBIDDEN_COLUMNS as readonly string[]).includes(colName)) {
        errors.push(`kolom terlarang ${table}.${colName}`);
      }
    }
  }

  if (!tableNames.includes('words_fts')) {
    errors.push('words_fts hilang');
  } else {
    try {
      await client.execute(`SELECT word_id FROM words_fts LIMIT 1`);
    } catch (e) {
      errors.push(`FTS smoke gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const meta = await client.execute(
    `SELECT value FROM release_meta WHERE key = 'schema_version'`,
  );
  const metaValue = meta.rows[0] ? String(meta.rows[0].value ?? meta.rows[0][0]) : undefined;
  const schemaVersion = metaValue ? Number(metaValue) : NaN;
  if (schemaVersion !== PUBLIC_SCHEMA_VERSION) {
    errors.push(
      `schema_version meta=${metaValue ?? 'missing'} expected=${PUBLIC_SCHEMA_VERSION}`,
    );
  }

  const countResult = await client.execute(`SELECT COUNT(*) AS c FROM words`);
  const wordCount = Number(countResult.rows[0]?.c ?? countResult.rows[0]?.[0] ?? 0);

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, wordCount, schemaVersion };
}
