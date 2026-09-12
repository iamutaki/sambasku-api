import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { contributions } from './contributions.schema';
import { users } from './users.schema';

export const contributionReviews = pgTable(
  'contribution_reviews',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    contributionId: varchar('contribution_id', { length: 26 })
      .notNull()
      .references(() => contributions.id),
    // null saat masih menunggu penugasan reviewer — diisi saat review dijalankan
    reviewerId: varchar('reviewer_id', { length: 26 }).references(() => users.id),
    // pending | approved | rejected
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('contribution_reviews_contribution_reviewer_idx').on(t.contributionId, t.reviewerId)],
);
