import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

/**
 * Dokumen legal berversi (Syarat Ketentuan / Kebijakan Privasi).
 * Satu type hanya punya satu `published` aktif; versi aktif juga di
 * `app_settings.legal.*_version`.
 */
export const legalDocuments = sqliteTable(
  'legal_documents',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    /** terms | privacy */
    documentType: text('document_type').notNull(),
    /** Unik per type, mis. 2026-09-26 */
    version: text('version').notNull(),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    /** draft | published | archived */
    status: text('status').notNull().default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    createdBy: text('created_by').references(() => users.id),
    updatedBy: text('updated_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('legal_documents_type_version_uidx').on(t.documentType, t.version),
    index('legal_documents_type_status_idx').on(t.documentType, t.status),
  ],
);
