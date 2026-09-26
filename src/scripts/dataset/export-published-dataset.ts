import 'dotenv/config';

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';

import { createClient, type Client, type InArgs } from '@libsql/client';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { closeDb, db } from '@/shared/database/drizzle/client';
import {
  categories,
  dialects,
  examples,
  languages,
  lexicalRelations,
  meaningTranslations,
  meanings,
  pronunciations,
  wordAudios,
  wordCategories,
  wordClasses,
  wordImages,
  wordVariants,
  words,
} from '@/shared/database/drizzle/schema';
import { logger } from '@/shared/logging/logger';

import { PUBLIC_SCHEMA_DDL, PUBLIC_SCHEMA_VERSION } from './public-schema-v1';
import { validatePublicDb } from './validate-public-db';

export type ExportOptions = {
  outDir: string;
  releaseVersion: number;
  channel?: string;
  minAppVersion?: string;
};

export type ExportArtifacts = {
  sqlitePath: string;
  gzipPath: string;
  manifestPath: string;
  sha256SumsPath: string;
  sha256: string;
  size: number;
  wordCount: number;
};

function toUnix(v: Date | number | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  return null;
}

function toBoolInt(v: boolean | number | null | undefined): number {
  if (v === true || v === 1) return 1;
  return 0;
}

function toJsonText(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v ?? []);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertMany(
  client: Client,
  sqlText: string,
  rows: InArgs[],
): Promise<void> {
  if (rows.length === 0) return;
  const statements = rows.map((args) => ({ sql: sqlText, args }));
  // batch libsql: pecah supaya tidak meledak payload
  for (const part of chunk(statements, 200)) {
    await client.batch(part, 'write');
  }
}

/**
 * Export korpus published → SQLite publik + FTS + gzip + manifest.
 */
export async function exportPublishedDataset(
  options: ExportOptions,
): Promise<ExportArtifacts> {
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });

  const sqlitePath = join(outDir, 'database.sqlite');
  const gzipPath = join(outDir, 'database.sqlite.gz');
  const manifestPath = join(outDir, 'manifest.json');
  const sha256SumsPath = join(outDir, 'SHA256SUMS');

  await rm(sqlitePath, { force: true });
  await rm(gzipPath, { force: true });

  const out = createClient({ url: `file:${sqlitePath}` });
  await out.executeMultiple(PUBLIC_SCHEMA_DDL);

  const languageRows = await db
    .select()
    .from(languages)
    .where(isNull(languages.deletedAt));
  await insertMany(
    out,
    `INSERT INTO languages (id, code, name, native_name, description, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    languageRows.map((r) => [
      r.id,
      r.code,
      r.name,
      r.nativeName,
      r.description,
      toBoolInt(r.isActive),
    ]),
  );

  const dialectRows = await db.select().from(dialects).where(isNull(dialects.deletedAt));
  await insertMany(
    out,
    `INSERT INTO dialects (id, language_id, code, name, description, is_active, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    dialectRows.map((r) => [
      r.id,
      r.languageId,
      r.code,
      r.name,
      r.description,
      toBoolInt(r.isActive),
      toBoolInt(r.isDefault),
    ]),
  );

  const wordClassRows = await db
    .select()
    .from(wordClasses)
    .where(isNull(wordClasses.deletedAt));
  await insertMany(
    out,
    `INSERT INTO word_classes (id, parent_id, code, name, alias, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    wordClassRows.map((r) => [
      r.id,
      r.parentId,
      r.code,
      r.name,
      r.alias,
      r.description,
    ]),
  );

  const categoryRows = await db
    .select()
    .from(categories)
    .where(isNull(categories.deletedAt));
  await insertMany(
    out,
    `INSERT INTO categories (id, parent_id, name, description) VALUES (?, ?, ?, ?)`,
    categoryRows.map((r) => [r.id, r.parentId, r.name, r.description]),
  );

  const wordRows = await db
    .select()
    .from(words)
    .where(and(eq(words.status, 'published'), isNull(words.deletedAt)));
  const wordIds = wordRows.map((w) => w.id);

  await insertMany(
    out,
    `INSERT INTO words (
      id, language_id, lemma, notes, word_type, usage_labels, status,
      is_verified, verified_at, is_corrected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    wordRows.map((r) => [
      r.id,
      r.languageId,
      r.lemma,
      r.notes,
      r.wordType,
      toJsonText(r.usageLabels),
      r.status,
      toBoolInt(r.isVerified),
      toUnix(r.verifiedAt),
      toBoolInt(r.isCorrected),
      toUnix(r.createdAt) ?? 0,
      toUnix(r.updatedAt),
    ]),
  );

  if (wordIds.length === 0) {
    logger.warn('Export: 0 kata published - artifact tetap dibuat');
  }

  type MeaningRow = (typeof meanings)['$inferSelect'];
  const meaningAll: MeaningRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(meanings)
      .where(
        and(
          inArray(meanings.wordId, ids),
          eq(meanings.status, 'published'),
          isNull(meanings.deletedAt),
        ),
      );
    meaningAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO meanings (
      id, word_id, word_class_id, inherited_from_meaning_id, definition,
      is_have_definition, is_have_translation, order_index, notes, status,
      is_verified, is_corrected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    meaningAll.map((r) => [
      r.id,
      r.wordId,
      r.wordClassId,
      r.inheritedFromMeaningId,
      r.definition,
      toBoolInt(r.isHaveDefinition),
      toBoolInt(r.isHaveTranslation),
      r.orderIndex,
      r.notes,
      r.status,
      toBoolInt(r.isVerified),
      toBoolInt(r.isCorrected),
    ]),
  );

  const meaningIds = meaningAll.map((m) => m.id);
  type TranslationRow = (typeof meaningTranslations)['$inferSelect'];
  const translationAll: TranslationRow[] = [];
  for (const ids of chunk(meaningIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(meaningTranslations)
      .where(
        and(inArray(meaningTranslations.meaningId, ids), isNull(meaningTranslations.deletedAt)),
      );
    translationAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO meaning_translations (
      id, meaning_id, language_id, translation_text, translation_type, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    translationAll.map((r) => [
      r.id,
      r.meaningId,
      r.languageId,
      r.translationText,
      r.translationType,
      r.notes,
    ]),
  );

  type ExampleRow = (typeof examples)['$inferSelect'];
  const exampleAll: ExampleRow[] = [];
  for (const ids of chunk(meaningIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(examples)
      .where(
        and(
          inArray(examples.meaningId, ids),
          eq(examples.status, 'published'),
          isNull(examples.deletedAt),
        ),
      );
    exampleAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO examples (
      id, meaning_id, source_language_id, source_sentence, target_language_id,
      target_sentence, source_type, source_reference, notes, status,
      is_verified, is_corrected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    exampleAll.map((r) => [
      r.id,
      r.meaningId,
      r.sourceLanguageId,
      r.sourceSentence,
      r.targetLanguageId,
      r.targetSentence,
      r.sourceType,
      r.sourceReference,
      r.notes,
      r.status,
      toBoolInt(r.isVerified),
      toBoolInt(r.isCorrected),
    ]),
  );

  type VariantRow = (typeof wordVariants)['$inferSelect'];
  const variantAll: VariantRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(wordVariants)
      .where(and(inArray(wordVariants.wordId, ids), isNull(wordVariants.deletedAt)));
    variantAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO word_variants (
      id, word_id, form, variant_type, affix_type, affix_value, dialect_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    variantAll.map((r) => [
      r.id,
      r.wordId,
      r.form,
      r.variantType,
      r.affixType,
      r.affixValue,
      r.dialectId,
      r.notes,
    ]),
  );

  type WordCatRow = (typeof wordCategories)['$inferSelect'];
  const wordCatAll: WordCatRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(wordCategories)
      .where(and(inArray(wordCategories.wordId, ids), isNull(wordCategories.deletedAt)));
    wordCatAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO word_categories (word_id, category_id) VALUES (?, ?)`,
    wordCatAll.map((r) => [r.wordId, r.categoryId]),
  );

  const wordIdSet = new Set(wordIds);
  type RelationRow = (typeof lexicalRelations)['$inferSelect'];
  const relationAll: RelationRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(lexicalRelations)
      .where(
        and(inArray(lexicalRelations.sourceWordId, ids), isNull(lexicalRelations.deletedAt)),
      );
    for (const r of rows) {
      if (wordIdSet.has(r.targetWordId)) relationAll.push(r);
    }
  }

  await insertMany(
    out,
    `INSERT INTO lexical_relations (
      id, source_word_id, target_word_id, relation_type, notes
    ) VALUES (?, ?, ?, ?, ?)`,
    relationAll.map((r) => [
      r.id,
      r.sourceWordId,
      r.targetWordId,
      r.relationType,
      r.notes,
    ]),
  );

  type PronRow = (typeof pronunciations)['$inferSelect'];
  const pronunciationAll: PronRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(pronunciations)
      .where(
        and(
          inArray(pronunciations.wordId, ids),
          eq(pronunciations.status, 'published'),
          isNull(pronunciations.deletedAt),
        ),
      );
    pronunciationAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO pronunciations (
      id, word_id, dialect_id, notation, value, audio_url, speaker_name,
      notes, status, is_verified, is_corrected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pronunciationAll.map((r) => [
      r.id,
      r.wordId,
      r.dialectId,
      r.notation,
      r.value,
      r.audioUrl,
      r.speakerName,
      r.notes,
      r.status,
      toBoolInt(r.isVerified),
      toBoolInt(r.isCorrected),
    ]),
  );

  type ImageRow = (typeof wordImages)['$inferSelect'];
  const imageAll: ImageRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(wordImages)
      .where(
        and(
          inArray(wordImages.wordId, ids),
          eq(wordImages.status, 'published'),
          isNull(wordImages.deletedAt),
        ),
      );
    imageAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO word_images (
      id, word_id, url, alt_text, is_primary, content_warnings, status,
      is_verified, is_corrected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    imageAll.map((r) => [
      r.id,
      r.wordId,
      r.url,
      r.altText,
      toBoolInt(r.isPrimary),
      toJsonText(r.contentWarnings),
      r.status,
      toBoolInt(r.isVerified),
      toBoolInt(r.isCorrected),
    ]),
  );

  type AudioRow = (typeof wordAudios)['$inferSelect'];
  const audioAll: AudioRow[] = [];
  for (const ids of chunk(wordIds, 400)) {
    if (ids.length === 0) break;
    const rows = await db
      .select()
      .from(wordAudios)
      .where(
        and(
          inArray(wordAudios.wordId, ids),
          eq(wordAudios.status, 'published'),
          isNull(wordAudios.deletedAt),
        ),
      );
    audioAll.push(...rows);
  }

  await insertMany(
    out,
    `INSERT INTO word_audios (
      id, word_id, example_id, dialect_id, url, mime_type, file_size,
      duration_ms, speaker_name, is_primary, status, is_verified, is_corrected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    audioAll.map((r) => [
      r.id,
      r.wordId,
      r.exampleId,
      r.dialectId,
      r.url,
      r.mimeType,
      r.fileSize,
      r.durationMs,
      r.speakerName,
      toBoolInt(r.isPrimary),
      r.status,
      toBoolInt(r.isVerified),
      toBoolInt(r.isCorrected),
    ]),
  );

  const variantsByWord = new Map<string, string[]>();
  for (const v of variantAll) {
    const list = variantsByWord.get(v.wordId) ?? [];
    list.push(v.form);
    variantsByWord.set(v.wordId, list);
  }

  const meaningIdsByWord = new Map<string, string[]>();
  for (const m of meaningAll) {
    const list = meaningIdsByWord.get(m.wordId) ?? [];
    list.push(m.id);
    meaningIdsByWord.set(m.wordId, list);
  }

  const translationsByMeaning = new Map<string, string[]>();
  for (const t of translationAll) {
    const list = translationsByMeaning.get(t.meaningId) ?? [];
    list.push(t.translationText);
    translationsByMeaning.set(t.meaningId, list);
  }

  const ftsRows: InArgs[] = [];
  for (const w of wordRows) {
    const variantText = (variantsByWord.get(w.id) ?? []).join(' ');
    const mIds = meaningIdsByWord.get(w.id) ?? [];
    const translationParts: string[] = [];
    for (const mid of mIds) {
      translationParts.push(...(translationsByMeaning.get(mid) ?? []));
    }
    ftsRows.push([w.id, w.lemma, variantText, translationParts.join(' ')]);
  }

  await insertMany(
    out,
    `INSERT INTO words_fts (word_id, lemma, variants, translations) VALUES (?, ?, ?, ?)`,
    ftsRows,
  );

  const releasedAt = new Date().toISOString();
  const metaBatch: Array<{ sql: string; args: InArgs }> = [
    {
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['release_version', String(options.releaseVersion)],
    },
    {
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['schema_version', String(PUBLIC_SCHEMA_VERSION)],
    },
    {
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['released_at', releasedAt],
    },
  ];
  if (options.channel) {
    metaBatch.push({
      sql: `INSERT INTO release_meta (key, value) VALUES (?, ?)`,
      args: ['channel', options.channel],
    });
  }
  await out.batch(metaBatch, 'write');

  const validated = await validatePublicDb(out);
  out.close();

  if (!validated.ok) {
    throw new Error(`Validasi artifact gagal:\n${validated.errors.join('\n')}`);
  }

  await pipeline(
    createReadStream(sqlitePath),
    createGzip({ level: 9 }),
    createWriteStream(gzipPath),
  );

  const hash = createHash('sha256');
  await pipeline(createReadStream(gzipPath), hash);
  const sha256 = hash.digest('hex');
  const { size } = await stat(gzipPath);

  if (size > 12 * 1024 * 1024) {
    logger.warn(`Gzip ${size} bytes (>12MB) - warning saja, lanjut`);
  }

  const manifest = {
    release_version: options.releaseVersion,
    schema_version: PUBLIC_SCHEMA_VERSION,
    min_app_version: options.minAppVersion ?? '0.1.0',
    channel: options.channel ?? 'staging',
    database: {
      file: 'database.sqlite.gz',
      size,
      sha256,
    },
    released_at: releasedAt,
    word_count: validated.wordCount,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(sha256SumsPath, `${sha256}  database.sqlite.gz\n`, 'utf8');

  logger.info('Dataset export selesai', {
    outDir,
    wordCount: validated.wordCount,
    size,
    sha256,
  });

  return {
    sqlitePath,
    gzipPath,
    manifestPath,
    sha256SumsPath,
    sha256,
    size,
    wordCount: validated.wordCount,
  };
}

async function main(): Promise<void> {
  const releaseVersion = Number(process.env.DATASET_RELEASE_VERSION ?? '1');
  const channel = process.env.DATASET_CHANNEL ?? 'staging';
  const outDir =
    process.env.DATASET_OUT_DIR ?? resolve(process.cwd(), 'tmp/dataset-export');

  const artifacts = await exportPublishedDataset({
    outDir,
    releaseVersion,
    channel,
    minAppVersion: process.env.DATASET_MIN_APP_VERSION ?? '0.1.0',
  });

  const databaseOut = resolve(process.cwd(), '../database/out');
  if (existsSync(dirname(databaseOut))) {
    await mkdir(databaseOut, { recursive: true });
    await copyFile(artifacts.gzipPath, join(databaseOut, 'database.sqlite.gz'));
    await copyFile(artifacts.manifestPath, join(databaseOut, 'manifest.json'));
    await copyFile(artifacts.sha256SumsPath, join(databaseOut, 'SHA256SUMS'));
    logger.info(`Artifact juga disalin ke ${databaseOut}`);
  }
}

const isDirect =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirect) {
  main()
    .then(() => closeDb())
    .catch(async (err) => {
      logger.error('dataset:export gagal', { err: String(err) });
      await closeDb().catch(() => {});
      process.exitCode = 1;
    });
}
