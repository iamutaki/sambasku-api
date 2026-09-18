import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { relations } from 'drizzle-orm';

// Kelas kata hierarkis (mis. Verba > Verba Transitif).
// alias = nama lain yang lebih dikenal user (Verba → "Kata Kerja");
// description = keterangan singkat + istilah asing (verb) - keduanya
// ditampilkan dropdown supaya user tak perlu hafal istilah teknis.
export const wordClasses = pgTable('word_classes', {
  id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
  parentId: varchar('parent_id', { length: 26 }),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  alias: varchar('alias', { length: 100 }),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  updatedAt: timestamp('updated_at'),
});

// Self-reference dideklarasikan lewat relasi Drizzle (bukan FK constraint
// self-join di column - Drizzle tidak support .references ke diri sendiri
// saat deklarasi). parent_id divalidasi di aplikasi.
export const wordClassesRelations = relations(wordClasses, ({ one }) => ({
  parent: one(wordClasses, {
    fields: [wordClasses.parentId],
    references: [wordClasses.id],
    relationName: 'word_class_parent',
  }),
}));
