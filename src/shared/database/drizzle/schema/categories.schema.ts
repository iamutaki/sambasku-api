import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export const categories = pgTable(
  'categories',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    parentId: varchar('parent_id', { length: 26 }),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    // Nama kategori unik di antara baris aktif - cegah duplikat seed/form.
    // Parsial agar nama yang sudah soft-deleted boleh dipakai ulang.
    uniqueIndex('categories_active_name_idx')
      .on(t.name)
      .where(sql`deleted_at is null`),
  ],
);
