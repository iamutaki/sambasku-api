import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { searchMisses } from './search-misses.schema';

export const contributions = pgTable(
  'contributions',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    // 'word' | 'meaning' | dst
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 26 }).notNull(),
    // 'create' | 'update' | 'delete' | 'publish' | dst
    action: varchar('action', { length: 50 }).notNull(),
    // Status antrean review (Section 22 - approval gate):
    // pending | approved | rejected | corrected - turunan dari status
    // entity saat insert ('pending_review' → 'pending', selain itu
    // 'approved'); baris lama di-backfill 'approved' lewat migration
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    description: text('description'),
    // Provenance jalur search-miss (12-api) - nullable: kontribusi biasa OK
    searchMissId: varchar('search_miss_id', { length: 26 }).references(() => searchMisses.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    index('contributions_user_created_idx').on(t.userId, t.createdAt),
    index('contributions_entity_idx').on(t.entityType, t.entityId),
    index('contributions_status_idx').on(t.status),
    index('contributions_search_miss_idx').on(t.searchMissId),
  ],
);
