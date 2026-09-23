import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { relations } from 'drizzle-orm';

// Kelas kata hierarkis (mis. Verba > Verba Transitif).
// alias = nama lain yang lebih dikenal user (Verba → "Kata Kerja");
// description = keterangan singkat + istilah asing (verb) - keduanya
// ditampilkan dropdown supaya user tak perlu hafal istilah teknis.
export const wordClasses = sqliteTable('word_classes', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  parentId: text('parent_id'),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  alias: text('alias'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  deletedBy: text('deleted_by').references(() => users.id),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
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
