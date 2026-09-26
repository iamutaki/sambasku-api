/** Kontrak schema publik v1 - sinkron `database/schema/v1.md`. */

export const PUBLIC_SCHEMA_VERSION = 1;

export const PUBLIC_SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE release_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE languages (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  native_name TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE dialects (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL REFERENCES languages(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE word_classes (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  alias TEXT,
  description TEXT
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE words (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL REFERENCES languages(id),
  lemma TEXT NOT NULL,
  notes TEXT,
  word_type TEXT NOT NULL DEFAULT 'word',
  usage_labels TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  is_corrected INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE INDEX words_lemma_az_idx ON words (lower(lemma), id);
CREATE INDEX words_language_lemma_idx ON words (language_id, lemma);

CREATE TABLE meanings (
  id TEXT PRIMARY KEY NOT NULL,
  word_id TEXT NOT NULL REFERENCES words(id),
  word_class_id TEXT REFERENCES word_classes(id),
  inherited_from_meaning_id TEXT,
  definition TEXT NOT NULL,
  is_have_definition INTEGER NOT NULL DEFAULT 1,
  is_have_translation INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_corrected INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX meanings_word_order_idx ON meanings (word_id, order_index);

CREATE TABLE meaning_translations (
  id TEXT PRIMARY KEY NOT NULL,
  meaning_id TEXT NOT NULL REFERENCES meanings(id),
  language_id TEXT NOT NULL REFERENCES languages(id),
  translation_text TEXT NOT NULL,
  translation_type TEXT NOT NULL DEFAULT 'direct',
  notes TEXT
);

CREATE TABLE examples (
  id TEXT PRIMARY KEY NOT NULL,
  meaning_id TEXT NOT NULL REFERENCES meanings(id),
  source_language_id TEXT NOT NULL REFERENCES languages(id),
  source_sentence TEXT NOT NULL,
  target_language_id TEXT REFERENCES languages(id),
  target_sentence TEXT,
  source_type TEXT,
  source_reference TEXT,
  notes TEXT,
  status TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_corrected INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE word_variants (
  id TEXT PRIMARY KEY NOT NULL,
  word_id TEXT NOT NULL REFERENCES words(id),
  form TEXT NOT NULL,
  variant_type TEXT NOT NULL DEFAULT 'alternative',
  affix_type TEXT,
  affix_value TEXT,
  dialect_id TEXT REFERENCES dialects(id),
  notes TEXT
);

CREATE INDEX word_variants_word_idx ON word_variants (word_id);

CREATE TABLE word_categories (
  word_id TEXT NOT NULL REFERENCES words(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (word_id, category_id)
);

CREATE TABLE lexical_relations (
  id TEXT PRIMARY KEY NOT NULL,
  source_word_id TEXT NOT NULL REFERENCES words(id),
  target_word_id TEXT NOT NULL REFERENCES words(id),
  relation_type TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX lexical_relations_target_idx ON lexical_relations (target_word_id);

CREATE TABLE pronunciations (
  id TEXT PRIMARY KEY NOT NULL,
  word_id TEXT NOT NULL REFERENCES words(id),
  dialect_id TEXT REFERENCES dialects(id),
  notation TEXT NOT NULL DEFAULT 'ipa',
  value TEXT NOT NULL,
  audio_url TEXT,
  speaker_name TEXT,
  notes TEXT,
  status TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_corrected INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE word_images (
  id TEXT PRIMARY KEY NOT NULL,
  word_id TEXT NOT NULL REFERENCES words(id),
  url TEXT NOT NULL,
  alt_text TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  content_warnings TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_corrected INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX word_images_word_idx ON word_images (word_id);

CREATE TABLE word_audios (
  id TEXT PRIMARY KEY NOT NULL,
  word_id TEXT NOT NULL REFERENCES words(id),
  example_id TEXT REFERENCES examples(id),
  dialect_id TEXT REFERENCES dialects(id),
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration_ms INTEGER,
  speaker_name TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_corrected INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX word_audios_word_idx ON word_audios (word_id);
CREATE INDEX word_audios_example_idx ON word_audios (example_id);

CREATE VIRTUAL TABLE words_fts USING fts5(
  word_id UNINDEXED,
  lemma,
  variants,
  translations,
  tokenize = 'unicode61'
);
`;

/** Tabel yang tidak boleh muncul di artifact publik. */
export const FORBIDDEN_TABLES = [
  'users',
  'auth_identities',
  'refresh_tokens',
  'email_verification_otps',
  'password_reset_tokens',
  'account_deletion_tokens',
  'contributions',
  'contribution_reviews',
  'word_edit_suggestions',
  'search_misses',
  'audit_logs',
  'votes',
  'comments',
  'bookmarks',
  'device_tokens',
  'notifications',
  'notification_templates',
  'notification_campaigns',
  'notification_campaign_recipients',
  'verifier_applications',
  'bug_reports',
  'word_reports',
  'translation_helps',
  'translation_help_replies',
  'word_import_sessions',
  'comment_blocklist_words',
] as const;

/** Nama kolom yang tidak boleh ada di tabel mana pun. */
export const FORBIDDEN_COLUMNS = [
  'created_by',
  'updated_by',
  'deleted_by',
  'verified_by',
  'taken_down_by',
  'takedown_reason_code',
  'takedown_note',
  'password_hash',
  'email',
  'lemma_allows_comma',
  'translation_allows_comma',
  'provider',
  'provider_file_id',
  'sha',
] as const;

export const ALLOWED_TABLES = [
  'release_meta',
  'languages',
  'dialects',
  'word_classes',
  'categories',
  'words',
  'meanings',
  'meaning_translations',
  'examples',
  'word_variants',
  'word_categories',
  'lexical_relations',
  'pronunciations',
  'word_images',
  'word_audios',
  'words_fts',
] as const;
