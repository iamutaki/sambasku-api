import type { AppDatabase } from './client';
import { ensureTestDbReady } from './test-client';
import {
  accountDeletionTokens,
  apiClients,
  appSettings,
  auditLogs,
  authIdentities,
  bookmarks,
  bugReports,
  categories,
  commentBlocklistWords,
  comments,
  contributionReviews,
  contributions,
  deviceTokens,
  dialects,
  emailVerificationOtps,
  examples,
  languages,
  legalDocuments,
  lexicalRelations,
  meanings,
  meaningTranslations,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationTemplates,
  notifications,
  passwordResetTokens,
  pronunciations,
  refreshTokens,
  searchMisses,
  translationHelpReplies,
  translationHelps,
  userConsents,
  users,
  verifierApplications,
  votes,
  wordAudios,
  wordCategories,
  wordClasses,
  wordEditSuggestions,
  wordImages,
  wordImportSessions,
  wordReports,
  wordVariants,
  words,
} from './schema';
import { FIRST_PARTY_SCOPE_STRING } from '@/modules/developer-oauth/domain/entities/api-client.entity';

const LEGAL_VERSION = '2026-09-26';
const FIRST_PARTY_SCOPES_JSON = JSON.stringify(FIRST_PARTY_SCOPE_STRING.split(' '));

/**
 * Seed referensi yang wajib ada setelah truncate (register consent + login
 * first-party). Isi selaras migrasi 0020/0021.
 */
export async function reseedTestReferenceData(db: AppDatabase): Promise<void> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values([
      { key: 'oauth.third_party_registration', value: 'closed', updatedAt: now, updatedBy: null },
      { key: 'oauth.request_log_retention_days', value: '90', updatedAt: now, updatedBy: null },
      { key: 'legal.terms_version', value: LEGAL_VERSION, updatedAt: now, updatedBy: null },
      { key: 'legal.privacy_version', value: LEGAL_VERSION, updatedAt: now, updatedBy: null },
    ])
    .onConflictDoNothing();

  await db
    .insert(legalDocuments)
    .values([
      {
        id: '01LEGALPRIVACY20260926001',
        documentType: 'privacy',
        version: LEGAL_VERSION,
        title: 'Kebijakan Privasi',
        bodyMarkdown: '# Kebijakan Privasi (test seed)',
        status: 'published',
        publishedAt: now,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      },
      {
        id: '01LEGALSTERMS202609260001',
        documentType: 'terms',
        version: LEGAL_VERSION,
        title: 'Syarat dan Ketentuan',
        bodyMarkdown: '# Syarat Ketentuan (test seed)',
        status: 'published',
        publishedAt: now,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(apiClients)
    .values([
      {
        id: '01APICLIENTMOBILE000000001',
        clientId: 'sambasku-mobile',
        clientSecretHash: null,
        name: 'SambasKu Mobile',
        description: 'Test seed',
        ownerUserId: null,
        status: 'approved',
        isFirstParty: true,
        homepageUrl: null,
        privacyUrl: null,
        redirectUris: '[]',
        allowedScopes: FIRST_PARTY_SCOPES_JSON,
        allowedChannels: '["mobile"]',
        rateLimitTier: 'first_party',
        createdAt: now,
        updatedAt: null,
      },
      {
        id: '01APICLIENTWEB00000000001',
        clientId: 'sambasku-web',
        clientSecretHash: null,
        name: 'SambasKu Web',
        description: 'Test seed',
        ownerUserId: null,
        status: 'approved',
        isFirstParty: true,
        homepageUrl: null,
        privacyUrl: null,
        redirectUris: '[]',
        allowedScopes: FIRST_PARTY_SCOPES_JSON,
        allowedChannels: '["web"]',
        rateLimitTier: 'first_party',
        createdAt: now,
        updatedAt: null,
      },
      {
        id: '01APICLIENTCONSOLE00000001',
        clientId: 'sambasku-console',
        clientSecretHash: null,
        name: 'SambasKu Console',
        description: 'Test seed',
        ownerUserId: null,
        status: 'approved',
        isFirstParty: true,
        homepageUrl: null,
        privacyUrl: null,
        redirectUris: '[]',
        allowedScopes: FIRST_PARTY_SCOPES_JSON,
        allowedChannels: '["web"]',
        rateLimitTier: 'first_party',
        createdAt: now,
        updatedAt: null,
      },
    ])
    .onConflictDoNothing();
}

// Hapus semua tabel dalam urutan aman FK (anak dulu) - pakai ini di
// beforeEach/beforeAll integration & e2e test, jangan delete per tabel.
export async function truncateAll(db: AppDatabase): Promise<void> {
  await ensureTestDbReady();
  for (const table of [
    auditLogs,
    wordReports,
    bugReports,
    translationHelpReplies,
    translationHelps,
    contributionReviews,
    contributions,
    wordEditSuggestions,
    votes,
    commentBlocklistWords,
    comments,
    bookmarks,
    notificationCampaignRecipients,
    notificationCampaigns,
    notificationTemplates,
    notifications,
    deviceTokens,
    verifierApplications,
    lexicalRelations,
    pronunciations,
    wordAudios,
    examples,
    meaningTranslations,
    passwordResetTokens,
    accountDeletionTokens,
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
    wordImportSessions,
    // Legal / OAuth - harus sebelum users (FK created_by / user_id / owner)
    userConsents,
    legalDocuments,
    appSettings,
    apiClients,
    users,
  ]) {
    await db.delete(table);
  }

  await reseedTestReferenceData(db);
}
