import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '@/shared/errors/app-error';
import { GetTranslationHelpDetailUseCase } from '../../application/use-cases/get-translation-help-detail.use-case';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';
import type {
  TranslationHelp,
  TranslationHelpReply,
} from '../../domain/entities/translation-help.entity';
import type { VoteRepository } from '@/modules/vote/domain/repositories/vote.repository';

const HELP_ID = '01JDHELPTRANSL0000000000000';
const USER = '01JDUSERKONTRIB0000000000A';
const R1 = '01JDREPLY000000000000000001';
const R2 = '01JDREPLY000000000000000002';
const R3 = '01JDREPLY000000000000000003';

function makeHelp(overrides: Partial<TranslationHelp> = {}): TranslationHelp {
  return {
    id: HELP_ID,
    userId: USER,
    username: 'peminta',
    body: 'Apa arti ini?',
    images: [],
    status: 'published',
    rejectionNote: null,
    reviewedBy: null,
    reviewedAt: null,
    pinnedReplyId: null,
    createdAt: new Date('2026-09-24T00:00:00Z'),
    updatedAt: null,
    ...overrides,
  };
}

function makeReply(
  id: string,
  overrides: Partial<TranslationHelpReply> = {},
): TranslationHelpReply {
  return {
    id,
    helpId: HELP_ID,
    userId: USER,
    username: 'penjawab',
    userRole: 'contributor',
    body: `balasan ${id.slice(-1)}`,
    bodyOriginal: null,
    status: 'published',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-09-24T01:00:00Z'),
    updatedAt: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<TranslationHelpRepository> = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeHelp()),
    list: vi.fn(),
    updateStatus: vi.fn(),
    setPinnedReply: vi.fn(),
    createReply: vi.fn(),
    findReplyById: vi.fn(),
    listReplies: vi.fn().mockResolvedValue([]),
    markReplyDeletedByAuthor: vi.fn(),
    takedownReply: vi.fn(),
    ...overrides,
  } as unknown as TranslationHelpRepository;
}

function makeVoteRepo(counts = new Map<string, { upvotes: number; downvotes: number }>()) {
  return {
    targetExists: vi.fn(),
    toggle: vi.fn(),
    countMany: vi.fn().mockResolvedValue(counts),
    findUserVotes: vi.fn(),
  } as unknown as VoteRepository;
}

describe('GetTranslationHelpDetailUseCase', () => {
  it('published → replies di-enrich upvotes/downvotes + diurutkan pinned/net/created', async () => {
    const olderHigh = makeReply(R1, {
      body: 'tinggi',
      createdAt: new Date('2026-09-24T01:00:00Z'),
    });
    const newerLow = makeReply(R2, {
      body: 'rendah',
      createdAt: new Date('2026-09-24T02:00:00Z'),
    });
    const pinned = makeReply(R3, {
      body: 'pinned',
      createdAt: new Date('2026-09-24T00:30:00Z'),
    });

    const counts = new Map([
      [`translation_help_reply:${R1}`, { upvotes: 5, downvotes: 0 }],
      [`translation_help_reply:${R2}`, { upvotes: 1, downvotes: 0 }],
      [`translation_help_reply:${R3}`, { upvotes: 0, downvotes: 0 }],
    ]);

    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(makeHelp({ pinnedReplyId: R3 })),
      listReplies: vi.fn().mockResolvedValue([olderHigh, newerLow, pinned]),
    });
    const voteRepo = makeVoteRepo(counts);
    const uc = new GetTranslationHelpDetailUseCase(repo, voteRepo);

    const result = await uc.execute({ id: HELP_ID });

    expect(voteRepo.countMany).toHaveBeenCalledWith([
      { entityType: 'translation_help', entityId: HELP_ID },
      { entityType: 'translation_help_reply', entityId: R1 },
      { entityType: 'translation_help_reply', entityId: R2 },
      { entityType: 'translation_help_reply', entityId: R3 },
    ]);
    expect(result.replies.map((r) => r.id)).toEqual([R3, R1, R2]);
    expect(result.replies[0]).toMatchObject({ id: R3, upvotes: 0, downvotes: 0 });
    expect(result.replies[1]).toMatchObject({ id: R1, upvotes: 5, downvotes: 0 });
    expect(result.replies[2]).toMatchObject({ id: R2, upvotes: 1, downvotes: 0 });
    expect(result.help.upvotes).toBe(0);
  });

  it('pending non-owner → TRANSLATION_HELP_NOT_FOUND', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(makeHelp({ status: 'pending_review' })),
    });
    const uc = new GetTranslationHelpDetailUseCase(repo, makeVoteRepo());
    await expect(uc.execute({ id: HELP_ID, viewerUserId: 'other' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('pending owner → replies kosong (belum published)', async () => {
    const repo = makeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(makeHelp({ status: 'pending_review', userId: USER })),
      listReplies: vi.fn().mockResolvedValue([makeReply(R1)]),
    });
    const voteRepo = makeVoteRepo();
    const uc = new GetTranslationHelpDetailUseCase(repo, voteRepo);

    const result = await uc.execute({ id: HELP_ID, viewerUserId: USER });
    expect(result.replies).toEqual([]);
    expect(voteRepo.countMany).toHaveBeenCalledWith([
      { entityType: 'translation_help', entityId: HELP_ID },
    ]);
  });
});
