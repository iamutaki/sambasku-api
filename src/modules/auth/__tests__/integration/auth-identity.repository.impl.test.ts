import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { authIdentities } from '@/shared/database/drizzle/schema';
import { UserRepositoryImpl } from '../../infrastructure/user.repository.impl';
import { AuthIdentityRepositoryImpl } from '../../infrastructure/auth-identity.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

describe.skipIf(!hasTestDb)('AuthIdentityRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const userRepo = new UserRepositoryImpl(db);
  const repo = new AuthIdentityRepositoryImpl(db);

  beforeEach(async () => {
    await truncateAll(db);
  });

  it('findByProvider mengembalikan baris deletedAt terisi', async () => {
    const user = await userRepo.save({
      username: 'google-user',
      email: 'google@test.com',
      phone: null,
      passwordHash: null,
      emailVerified: true,
    });
    const identity = await repo.create({
      userId: user.id,
      provider: 'google',
      providerUserId: 'sub-deleted',
      emailAtProvider: 'google@test.com',
    });
    await db
      .update(authIdentities)
      .set({ deletedAt: new Date() })
      .where(eq(authIdentities.id, identity.id));

    const found = await repo.findByProvider('google', 'sub-deleted');
    expect(found).not.toBeNull();
    expect(found?.deletedAt).toBeInstanceOf(Date);
    expect(found?.userId).toBe(user.id);
  });

  it('unique (provider, sub) + createUserWithGoogleIdentity race → created false', async () => {
    const first = await repo.createUserWithGoogleIdentity(
      {
        username: 'race-a',
        email: 'race@test.com',
        phone: null,
        passwordHash: null,
        emailVerified: true,
      },
      { provider: 'google', providerUserId: 'sub-race', emailAtProvider: 'race@test.com' },
    );
    expect(first.created).toBe(true);

    const second = await repo.createUserWithGoogleIdentity(
      {
        username: 'race-b',
        email: 'race-other@test.com',
        phone: null,
        passwordHash: null,
        emailVerified: true,
      },
      { provider: 'google', providerUserId: 'sub-race', emailAtProvider: 'race@test.com' },
    );
    expect(second.created).toBe(false);
    expect(second.identity.providerUserId).toBe('sub-race');
    expect(second.user.id).toBe(first.user.id);
  });
});
