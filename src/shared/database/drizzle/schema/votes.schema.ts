import { index, pgTable, smallint, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Vote polymorphic (08-api-upvote-downvote.md): 1 user = 1 vote per target,
// dijamin UNIQUE (user_id, entity_type, entity_id) - sekaligus penjaga race
// dua toggle bersamaan. Target TANPA FK - preseden contributions.
// Vote mati = baris di-DELETE hard (TIDAK ada deleted_at); jumlah vote
// SELALU dihitung on-read (count FILTER) supaya tidak bisa drift.
export const votes = pgTable(
  'votes',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    // 'word' | 'meaning' | 'example' | 'pronunciation' | 'word_image'
    // ('comment' menyusul bersama modul comment - 09-api-comment.md)
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 26 }).notNull(),
    // 1 = upvote, -1 = downvote. smallint bukan boolean: arah eksplisit,
    // sum(value) siap dipakai kalau kelak mau skor/net-score.
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    uniqueIndex('votes_user_target_unique').on(t.userId, t.entityType, t.entityId),
    index('votes_target_idx').on(t.entityType, t.entityId),
  ],
);
