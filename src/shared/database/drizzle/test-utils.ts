import type { AppDatabase } from './client';
import { ensureTestDbReady } from './test-client';
import {
  auditLogs,
  authIdentities,
  bookmarks,
  bugReports,
  categories,
  comments,
  contributionReviews,
  contributions,
  deviceTokens,
  dialects,
  emailVerificationOtps,
  examples,
  languages,
  lexicalRelations,
  meanings,
  meaningTranslations,
  notifications,
  passwordResetTokens,
  pronunciations,
  refreshTokens,
  searchMisses,
  users,
  verifierApplications,
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
export async function truncateAll(db: AppDatabase): Promise<void> {
  await ensureTestDbReady();
  for (const table of [
    auditLogs,
    bugReports,
    contributionReviews,
    contributions,
    wordEditSuggestions,
    votes,
    comments,
    bookmarks,
    notifications,
    deviceTokens,
    verifierApplications,
    lexicalRelations,
    pronunciations,
    examples,
    meaningTranslations,
    passwordResetTokens,
    refreshTokens,
    authIdentities,
    emailVerificationOtps,
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
