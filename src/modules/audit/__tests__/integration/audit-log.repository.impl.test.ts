import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { auditLogs, users } from '@/shared/database/drizzle/schema';
import { eq } from 'drizzle-orm';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { AuditLogRepositoryImpl } from '../../infrastructure/audit-log.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const USER_A = ulid26('01AUDITUSERA');
const USER_B = ulid26('01AUDITUSERB');
const WORD_1 = ulid26('01AUDITWORD1');

describe.skipIf(!hasTestDb)('AuditLogRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new AuditLogRepositoryImpl(db);

  beforeEach(async () => {
    await truncateAll(db);
    await db.insert(users).values([
      { id: USER_A, username: 'audita', email: 'audita@test.com', passwordHash: 'x' },
      { id: USER_B, username: 'auditb', email: 'auditb@test.com', passwordHash: 'x' },
    ]);
  });

  it('record menyimpan entri lengkap', async () => {
    await repo.record({
      userId: USER_A,
      action: 'create',
      entityType: 'word',
      entityId: WORD_1,
      newData: { lemma: 'makatn', status: 'published' },
      requestId: 'req-1',
    });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, WORD_1));
    expect(rows).toHaveLength(1);
    expect(rows[0].newData).toEqual({ lemma: 'makatn', status: 'published' });
    expect(rows[0].requestId).toBe('req-1');
  });

  it('list: filter entity_type + user_id + cursor pagination (Section 13), terbaru dulu', async () => {
    const log1 = { userId: USER_A, action: 'create', entityType: 'word', entityId: WORD_1 };
    const log2 = { userId: USER_B, action: 'create', entityType: 'user', entityId: USER_B };
    const log3 = { userId: USER_A, action: 'password_change', entityType: 'user', entityId: USER_A };
    await repo.record(log1);
    await repo.record(log2);
    await repo.record(log3);

    const byType = await repo.list({ entityType: 'word', limit: 10 });
    expect(byType.items.length).toBeGreaterThanOrEqual(1);
    expect(byType.items[0].entityId).toBe(WORD_1);
    expect(typeof byType.hasMore).toBe('boolean');

    const byUser = await repo.list({ userId: USER_A, limit: 10 });
    expect(byUser.items.length).toBeGreaterThanOrEqual(2);

    const hal1 = await repo.list({ limit: 2 });
    expect(hal1.items).toHaveLength(2);
    expect(hal1.hasMore).toBe(true);
    expect(hal1.nextCursor).toBe(hal1.items[1].id);

    const hal2 = await repo.list({ limit: 2, cursor: hal1.nextCursor! });
    expect(hal2.items.length).toBeGreaterThanOrEqual(1);
    for (const item of hal2.items) {
      expect(hal1.items.map((i) => i.id)).not.toContain(item.id);
    }

    const semua = await repo.list({ limit: 10 });
    expect(semua.items.length).toBeGreaterThanOrEqual(3);
    expect(new Date(semua.items[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(semua.items[semua.items.length - 1].createdAt).getTime(),
    );
  });

  it('record TIDAK melempar saat insert gagal (best-effort, kontrak Section 21)', async () => {
    // user_id tidak ada → FK violation; record harus menelan error
    await expect(
      repo.record({ userId: ulid26('01AUDITUSERX'), action: 'create', entityType: 'word', entityId: WORD_1 }),
    ).resolves.toBeUndefined();
  });
});
