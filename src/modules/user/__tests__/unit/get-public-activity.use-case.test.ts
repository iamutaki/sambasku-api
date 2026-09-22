import { describe, it, expect, vi } from 'vitest';
import { GetPublicActivityUseCase } from '../../application/use-cases/get-public-activity.use-case';
import { NotFoundError } from '@/shared/errors/app-error';
import type { PublicUserRepository } from '../../domain/repositories/public-user.repository';

describe('GetPublicActivityUseCase', () => {
  it('404 jika user tidak ada', async () => {
    const repo = {
      findPublicByUsername: vi.fn().mockResolvedValue(null),
    } as unknown as PublicUserRepository;
    const uc = new GetPublicActivityUseCase(repo);
    await expect(uc.execute('tidakada')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('merge 3 sumber, urut occurred_at desc, potong 20', async () => {
    const now = Date.now();
    const repo = {
      findPublicByUsername: vi.fn().mockResolvedValue({
        id: 'u1',
        username: 'budi',
        role: 'contributor',
        joinedAt: new Date(),
        avatarUrl: null,
      }),
      listRecentApprovedContributions: vi.fn().mockResolvedValue([
        {
          kind: 'contribution',
          occurredAt: new Date(now - 1000),
          wordId: 'w1',
          lemma: 'makatn',
          summary: 'Kata: makatn',
        },
      ]),
      listRecentPublishedComments: vi.fn().mockResolvedValue([
        {
          kind: 'comment',
          occurredAt: new Date(now),
          wordId: 'w1',
          lemma: 'makatn',
          summary: 'komentar baru',
        },
      ]),
      listRecentVerifications: vi.fn().mockResolvedValue([
        {
          kind: 'verification',
          occurredAt: new Date(now - 500),
          wordId: 'w2',
          lemma: 'nasi',
          summary: 'Memverifikasi Kata: nasi',
        },
      ]),
    } as unknown as PublicUserRepository;

    const items = await new GetPublicActivityUseCase(repo).execute('budi');
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(['comment', 'verification', 'contribution']);
  });
});
