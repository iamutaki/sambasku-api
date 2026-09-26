import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

/**
 * Klien API terdaftar (first-party seed + third-party OAuth).
 * JWT claim `azp` = `client_id` baris ini.
 */
export const apiClients = sqliteTable(
  'api_clients',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    /** Publik, unik - mis. sambasku-mobile */
    clientId: text('client_id').notNull().unique(),
    /** Hash secret untuk confidential client; null = public / first-party */
    clientSecretHash: text('client_secret_hash'),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: text('owner_user_id').references(() => users.id),
    /** pending | approved | suspended | revoked */
    status: text('status').notNull().default('pending'),
    isFirstParty: integer('is_first_party', { mode: 'boolean' }).notNull().default(false),
    homepageUrl: text('homepage_url'),
    privacyUrl: text('privacy_url'),
    /** JSON array string[] */
    redirectUris: text('redirect_uris').notNull().default('[]'),
    /** JSON array string[] - scopes yang boleh diminta */
    allowedScopes: text('allowed_scopes').notNull().default('[]'),
    /** JSON array: web | mobile - saluran login first-party yang diizinkan */
    allowedChannels: text('allowed_channels').notNull().default('[]'),
    rateLimitTier: text('rate_limit_tier').notNull().default('standard'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('api_clients_status_idx').on(t.status),
    index('api_clients_owner_idx').on(t.ownerUserId),
  ],
);
