import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    // Nama kategori unik di antara baris aktif - cegah duplikat seed/form.
    // Parsial agar nama yang sudah soft-deleted boleh dipakai ulang.
    uniqueIndex('categories_active_name_idx')
      .on(t.name)
      .where(sql`deleted_at is null`),
  ],
);
