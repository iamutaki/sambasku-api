import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Vote polymorphic (08-api-upvote-downvote.md): 1 user = 1 vote per target,
// dijamin UNIQUE (user_id, entity_type, entity_id) - sekaligus penjaga race
// dua toggle bersamaan. Target TANPA FK - preseden contributions.
// Vote mati = baris di-DELETE hard (TIDAK ada deleted_at); jumlah vote
// SELALU dihitung on-read supaya tidak bisa drift.
export const votes = sqliteTable(
  'votes',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    // 'word' | 'meaning' | 'example' | 'pronunciation' | 'word_image' |
    // 'comment' | 'translation_help_reply' | 'translation_help' (09 / 32)
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    // 1 = upvote, -1 = downvote. integer bukan boolean: arah eksplisit.
    value: integer('value').notNull(),
    /** api_clients.client_id dari JWT azp - atribusi third-party */
    clientId: text('client_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('votes_user_target_unique').on(t.userId, t.entityType, t.entityId),
    index('votes_target_idx').on(t.entityType, t.entityId),
    // Riwayat milik user: ORDER BY id DESC (26-api-my-votes.md)
    index('votes_user_id_id_idx').on(t.userId, t.id),
    index('votes_client_id_idx').on(t.clientId),
  ],
);
