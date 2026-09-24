import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export type TranslationHelpImageRow = {
  url: string;
  provider_file_id: string;
  public_url?: string | null;
};

/** Permintaan bantuan terjemahan (feed bantuan). Staging ImageKit → GitHub on approve. */
export const translationHelps = sqliteTable(
  'translation_helps',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body'),
    images: text('images', { mode: 'json' }).$type<TranslationHelpImageRow[]>().notNull(),
    // pending_review | published | rejected | taken_down
    status: text('status').notNull().default('pending_review'),
    rejectionNote: text('rejection_note'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    pinnedReplyId: text('pinned_reply_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('translation_helps_status_id_idx').on(t.status, t.id),
    index('translation_helps_user_id_idx').on(t.userId, t.id),
  ],
);

/** Balasan komunitas pada bantuan yang sudah tayang (post-moderation). */
export const translationHelpReplies = sqliteTable(
  'translation_help_replies',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    helpId: text('help_id')
      .notNull()
      .references(() => translationHelps.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    bodyOriginal: text('body_original'),
    // published | taken_down | deleted_by_author
    status: text('status').notNull().default('published'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('translation_help_replies_help_created_idx').on(t.helpId, t.createdAt, t.id),
    index('translation_help_replies_status_idx').on(t.status, t.id),
  ],
);
