import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

/**
 * Jejak persetujuan legal per user (audit-friendly).
 * Versi aktif = baris terbaru per (user_id, document_type).
 */
export const userConsents = sqliteTable(
  'user_consents',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    /** terms | privacy */
    documentType: text('document_type').notNull(),
    documentVersion: text('document_version').notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    /** register | social_gate | reconsent | accept_legal */
    source: text('source').notNull(),
    /** First-party client saat setuju (mobile/web/console) - string bebas di slice ini */
    clientId: text('client_id'),
    requestId: text('request_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('user_consents_user_type_accepted_idx').on(
      t.userId,
      t.documentType,
      t.acceptedAt,
    ),
  ],
);
