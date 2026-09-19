import { describe, it, expect, vi } from 'vitest';
import { CreateCommentUseCase } from '../../application/use-cases/create-comment.use-case';
import type { CommentRepository } from '../../domain/repositories/comment.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Comment } from '../../domain/entities/comment.entity';

const WORD_ID = '01JDWORDMAKATN0000000000A';
const USER = '01JDUSERKONTRIB0000000000A';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: '01JDCOMMENTMAKATN00000000A',
    wordId: WORD_ID,
    wordLemma: 'makatn',
    userId: USER,
    username: 'kontributor',
    body: 'Kata ini sering saya dengar',
    status: 'pending_review',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-09-18T10:00:00Z'),
    ...overrides,
  };
}

function makeDeps(wordExists = true) {
  const commentRepo = {
    create: vi.fn().mockResolvedValue(makeComment({ username: null })),
    findById: vi.fn().mockImplementation(async (id: string) =>
      id === '01JDCOMMENTMAKATN00000000A' ? makeComment() : null,
    ),
    listByWord: vi.fn(),
    softDelete: vi.fn(),
    listAdmin: vi.fn(),
    review: vi.fn(),
  } as unknown as CommentRepository;
  const wordRepo = {
    findById: vi.fn().mockResolvedValue(wordExists ? { id: WORD_ID } : null),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return {
    commentRepo,
    wordRepo,
    auditRepo,
    useCase: new CreateCommentUseCase(
      commentRepo,
      wordRepo,
      auditRepo as unknown as AuditLogRepository,
    ),
  };
}

describe('CreateCommentUseCase', () => {
  it('kata ada → create pending_review + audit create dengan new_data', async () => {
    const { useCase, commentRepo, auditRepo } = makeDeps();
    const comment = await useCase.execute({
      wordId: WORD_ID,
      userId: USER,
      role: 'contributor',
      requestId: 'req-1',
      body: 'Kata ini sering saya dengar',
    });

    expect(commentRepo.create).toHaveBeenCalledWith({
      wordId: WORD_ID,
      userId: USER,
      body: 'Kata ini sering saya dengar',
    });
    expect(comment.status).toBe('pending_review');
    expect(comment.username).toBe('kontributor'); // read-back ter-join
    expect(auditRepo.record).toHaveBeenCalledWith({
      userId: USER,
      action: 'create',
      entityType: 'comment',
      entityId: comment.id,
      newData: { word_id: WORD_ID, body: 'Kata ini sering saya dengar' },
      requestId: 'req-1',
    });
  });

  it('kata tidak ada / soft-deleted → 404 WORD_NOT_FOUND, create TIDAK dipanggil', async () => {
    const { useCase, commentRepo, auditRepo } = makeDeps(false);
    await expect(
      useCase.execute({ wordId: WORD_ID, userId: USER, role: 'contributor', body: 'x' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND', statusCode: 404 });
    expect(commentRepo.create).not.toHaveBeenCalled();
    expect(auditRepo.record).not.toHaveBeenCalled();
  });
});
