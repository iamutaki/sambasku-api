import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Khusus modul auth - lihat 00-api-auth.md
export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(), // sha256 hex
    /** api_clients.client_id - null = token lama sebelum cutover azp */
    clientId: text('client_id'),
    deviceInfo: text('device_info'),
    ipAddress: text('ip_address'),
    isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
    // Diisi hanya saat rotasi refresh. Logout / cabut semua perangkat
    // mengosongkannya lagi supaya jendela grace tidak menyelamatkan token
    // yang memang sengaja dicabut.
    rotatedAt: integer('rotated_at', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('refresh_tokens_user_id_idx').on(t.userId),
    index('refresh_tokens_client_id_idx').on(t.clientId),
  ],
);
