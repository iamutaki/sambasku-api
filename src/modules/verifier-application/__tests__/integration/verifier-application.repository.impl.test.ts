import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { UserRepositoryImpl } from '@/modules/auth/infrastructure/user.repository.impl';
import { VerifierApplicationRepositoryImpl } from '../../infrastructure/verifier-application.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

const links = [{ platform: 'instagram' as const, url: 'https://instagram.com/budi' }];

describe.skipIf(!hasTestDb)('VerifierApplicationRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const users = new UserRepositoryImpl(db);
  const repo = new VerifierApplicationRepositoryImpl(db);

  beforeEach(async () => {
    await truncateAll(db);
  });

  it('create UNIQUE user_id, list cursor, resubmit hanya rejected', async () => {
    const user = await users.save({
      username: 'budi-va',
      email: 'budi-va@test.com',
      phone: null,
      passwordHash: 'hash',
    });
    const created = await repo.create({
      userId: user.id,
      phone: '6281234567890',
      address: 'Jl. Merdeka No. 1, Sambas',
      socialLinks: links,
    });
    expect(created.status).toBe('pending');
    expect((await repo.findByUserId(user.id))?.id).toBe(created.id);

    const listed = await repo.list({ status: 'pending', limit: 20 });
    expect(listed.items.map((i) => i.id)).toContain(created.id);

    expect(await repo.resubmit(user.id, {
      phone: '6281111111111',
      address: 'Alamat baru yang cukup panjang',
      socialLinks: [{ platform: 'website', url: 'https://budi.example' }],
    })).toBeNull();

    await repo.markRejected(created.id, user.id, 'perbaiki');
    const again = await repo.resubmit(user.id, {
      phone: '6281111111111',
      address: 'Alamat baru yang cukup panjang',
      socialLinks: [{ platform: 'website', url: 'https://budi.example' }],
    });
    expect(again?.status).toBe('pending');
    expect(again?.adminComment).toBeNull();
  });

  it('createWithPhone unique HP → PHONE_ALREADY_EXISTS; unique user_id → APPLICATION_ALREADY_EXISTS', async () => {
    const owner = await users.save({
      username: 'owner-hp',
      email: 'owner-hp@test.com',
      phone: '6281999000001',
      passwordHash: 'hash',
    });
    const applicant = await users.save({
      username: 'apply-hp',
      email: 'apply-hp@test.com',
      phone: null,
      passwordHash: 'hash',
    });

    await expect(
      repo.createWithPhone({
        userId: applicant.id,
        phone: owner.phone!,
        address: 'Jl. Merdeka No. 1, Sambas',
        socialLinks: links,
      }),
    ).rejects.toMatchObject({ errorCode: 'PHONE_ALREADY_EXISTS', statusCode: 409 });

    const created = await repo.createWithPhone({
      userId: applicant.id,
      phone: '6281999000002',
      address: 'Jl. Merdeka No. 1, Sambas',
      socialLinks: links,
    });
    expect(created.status).toBe('pending');
    expect((await users.findById(applicant.id))?.phone).toBe('6281999000002');

    await expect(
      repo.createWithPhone({
        userId: applicant.id,
        phone: '6281999000003',
        address: 'Jl. Lain yang cukup panjang',
        socialLinks: links,
      }),
    ).rejects.toMatchObject({ errorCode: 'APPLICATION_ALREADY_EXISTS', statusCode: 409 });
  });

  it('approveAtomically menolak non-contributor dan pengajuan yang sudah ditolak', async () => {
    const admin = await users.save({
      username: 'admin-va',
      email: 'admin-va@test.com',
      phone: null,
      passwordHash: 'hash',
    });
    const contributor = await users.save({
      username: 'kon-va',
      email: 'kon-va@test.com',
      phone: '6281888000001',
      passwordHash: 'hash',
    });
    const editor = await users.save({
      username: 'ed-va',
      email: 'ed-va@test.com',
      phone: '6281888000002',
      passwordHash: 'hash',
    });
    await users.updateRole(editor.id, 'editor');

    const editorApp = await repo.create({
      userId: editor.id,
      phone: '6281888000002',
      address: 'Jl. Editor yang cukup panjang',
      socialLinks: links,
    });
    await expect(repo.approveAtomically(editorApp.id, admin.id)).rejects.toMatchObject({
      errorCode: 'ALREADY_VERIFIER',
      statusCode: 403,
    });
    expect((await users.findById(editor.id))?.role).toBe('editor');
    expect((await repo.findById(editorApp.id))?.status).toBe('pending');

    const pending = await repo.create({
      userId: contributor.id,
      phone: '6281888000001',
      address: 'Jl. Kontributor yang cukup panjang',
      socialLinks: links,
    });
    await repo.markRejected(pending.id, admin.id, 'ditolak');
    await expect(repo.approveAtomically(pending.id, admin.id)).rejects.toMatchObject({
      errorCode: 'APPLICATION_ALREADY_REVIEWED',
      statusCode: 409,
    });
    expect((await users.findById(contributor.id))?.role).toBe('contributor');

    await repo.resubmit(contributor.id, {
      phone: '6281888000001',
      address: 'Jl. Kontributor yang cukup panjang',
      socialLinks: links,
    });
    const approved = await repo.approveAtomically(pending.id, admin.id);
    expect(approved.status).toBe('approved');
    expect((await users.findById(contributor.id))?.role).toBe('reviewer');
  });
});
