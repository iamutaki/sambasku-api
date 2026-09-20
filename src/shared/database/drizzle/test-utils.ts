import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';
import {
  auditLogs,
  authIdentities,
  bookmarks,
  categories,
  comments,
  contributionReviews,
  contributions,
  dialects,
  examples,
  languages,
  lexicalRelations,
  meanings,
  meaningTranslations,
  passwordResetTokens,
  pronunciations,
  refreshTokens,
  searchMisses,
  users,
  votes,
  wordCategories,
  wordClasses,
  wordEditSuggestions,
  wordImages,
  wordVariants,
  words,
} from './schema';

// Hapus semua tabel dalam urutan aman FK (anak dulu) - pakai ini di
// beforeEach/beforeAll integration & e2e test, jangan delete per tabel.
export async function truncateAll(db: NodePgDatabase<typeof schema>): Promise<void> {
  for (const table of [
    auditLogs,
    contributionReviews,
    contributions,
    wordEditSuggestions,
    votes,
    comments,
    bookmarks,
    lexicalRelations,
    pronunciations,
    examples,
    meaningTranslations,
    passwordResetTokens,
    refreshTokens,
    authIdentities,
    searchMisses,
    wordCategories,
    wordImages,
    wordVariants,
    meanings,
    words,
    categories,
    wordClasses,
    dialects,
    languages,
    users,
  ]) {
    await db.delete(table);
  }
}
