import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';

import { users } from '@/shared/database/drizzle/schema';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { RefreshTokenRepositoryImpl } from '../../infrastructure/refresh-token.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

describe.skipIf(!hasTestDb)('RefreshTokenRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new RefreshTokenRepositoryImpl(db);

  let userId: string;

  beforeEach(async () => {
    await truncateAll(db);
    const [user] = await db
      .insert(users)
      .values({ username: 'budi', email: 'budi@test.com', passwordHash: 'hash' })
      .returning();
    userId = user.id;
  });

  it('menyimpan lalu menemukan token by hash', async () => {
    const created = await repo.create({
      userId,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 1000),
    });
    const found = await repo.findByHash('a'.repeat(64));
    expect(found?.id).toBe(created.id);
    expect(found?.isRevoked).toBe(false);
  });

  it('revokeByHash menandai is_revoked', async () => {
    await repo.create({ userId, tokenHash: 'b'.repeat(64), expiresAt: new Date() });
    await repo.revokeByHash('b'.repeat(64));
    expect((await repo.findByHash('b'.repeat(64)))?.isRevoked).toBe(true);
  });

  it('revokeAllForUser mencabut semua token milik user', async () => {
    await repo.create({ userId, tokenHash: 'c'.repeat(64), expiresAt: new Date() });
    await repo.create({ userId, tokenHash: 'd'.repeat(64), expiresAt: new Date() });
    await repo.revokeAllForUser(userId);
    expect((await repo.findByHash('c'.repeat(64)))?.isRevoked).toBe(true);
    expect((await repo.findByHash('d'.repeat(64)))?.isRevoked).toBe(true);
  });
});
