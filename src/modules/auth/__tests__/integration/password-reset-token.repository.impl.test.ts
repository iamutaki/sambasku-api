import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { passwordResetTokens, refreshTokens, users } from '@/shared/database/drizzle/schema';
import { PasswordResetTokenRepositoryImpl } from '../../infrastructure/password-reset-token.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

describe.skipIf(!hasTestDb)('PasswordResetTokenRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new PasswordResetTokenRepositoryImpl(db);

  let userId: string;

  beforeEach(async () => {
    await db.delete(passwordResetTokens);
    await db.delete(refreshTokens);
    await db.delete(users);
    const [user] = await db
      .insert(users)
      .values({ username: 'budi', email: 'budi@test.com', passwordHash: 'hash' })
      .returning();
    userId = user.id;
  });

  it('menyimpan dan mengambil token by hash', async () => {
    await repo.create({ userId, tokenHash: 'e'.repeat(64), expiresAt: new Date(Date.now() + 3600_000) });
    const found = await repo.findByHash('e'.repeat(64));
    expect(found?.userId).toBe(userId);
    expect(found?.isUsed).toBe(false);
  });

  it('consume atomik: sekali true, pemakaian kedua false (single-use)', async () => {
    await repo.create({ userId, tokenHash: 'f'.repeat(64), expiresAt: new Date() });
    expect(await repo.consume('f'.repeat(64))).toBe(true);
    expect(await repo.consume('f'.repeat(64))).toBe(false); // token sudah terbakar
    expect((await repo.findByHash('f'.repeat(64)))?.isUsed).toBe(true);
  });
});
