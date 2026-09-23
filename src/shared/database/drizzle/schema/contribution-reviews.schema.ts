import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { contributions } from './contributions.schema';
import { users } from './users.schema';

export const contributionReviews = sqliteTable(
  'contribution_reviews',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    contributionId: text('contribution_id')
      .notNull()
      .references(() => contributions.id),
    // null saat masih menunggu penugasan reviewer - diisi saat review dijalankan
    reviewerId: text('reviewer_id').references(() => users.id),
    // Ditulis saat verifikator mengambil keputusan (bukan saat submit):
    // approved | rejected | corrected - comment WAJIB untuk rejected
    status: text('status').notNull().default('pending'),
    comment: text('comment'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  deletedBy: text('deleted_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index('contribution_reviews_contribution_reviewer_idx').on(t.contributionId, t.reviewerId)],
);
