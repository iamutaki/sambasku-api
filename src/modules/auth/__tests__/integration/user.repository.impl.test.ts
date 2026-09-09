import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { passwordResetTokens, refreshTokens, users } from '@/shared/database/drizzle/schema';
import { UserRepositoryImpl } from '../../infrastructure/user.repository.impl';

// Test hanya jalan kalau .env.test ada dengan DATABASE_URL test (api-base-stack.md Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

describe.skipIf(!hasTestDb)('UserRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new UserRepositoryImpl(db);

  beforeEach(async () => {
    await db.delete(passwordResetTokens);
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  it('menyimpan dan mengambil user by email', async () => {
    await repo.save({ username: 'budi', email: 'budi@test.com', passwordHash: 'hash' });
    const found = await repo.findByEmail('budi@test.com');
    expect(found?.username).toBe('budi');
    expect(found?.role).toBe('contributor'); // default dari skema DB
  });

  it('findByUsername dan findById mengembalikan user yang sama', async () => {
    const saved = await repo.save({ username: 'siti', email: 'siti@test.com', passwordHash: 'hash' });
    expect((await repo.findByUsername('siti'))?.id).toBe(saved.id);
    expect((await repo.findById(saved.id))?.email).toBe('siti@test.com');
  });

  it('updatePassword mengubah password_hash', async () => {
    const saved = await repo.save({ username: 'rudi', email: 'rudi@test.com', passwordHash: 'lama' });
    await repo.updatePassword(saved.id, 'baru');
    expect((await repo.findById(saved.id))?.passwordHash).toBe('baru');
  });
});
