import { describe, it, expect, vi } from 'vitest';
import { ReviewCommentUseCase } from '../../application/use-cases/review-comment.use-case';
import type { CommentRepository } from '../../domain/repositories/comment.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Comment } from '../../domain/entities/comment.entity';

const REVIEWER = '01JDUSERADMIN00000000000000A';

function pendingComment(): Comment {
  return {
    id: '01JDCOMMENTMAKATN00000000A',
    wordId: '01JDWORDMAKATN0000000000A',
    userId: '01JDUSERKONTRIB0000000000A',
    username: 'kontributor',
    body: 'komentar',
    status: 'pending_review',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
  };
}

function reviewedComment(status: 'published' | 'rejected'): Comment {
  return { ...pendingComment(), status, reviewedBy: REVIEWER, reviewedAt: new Date() };
}

function makeDeps(reviewResult: boolean, readBack: Comment) {
  const commentRepo = {
    create: vi.fn(),
    // Panggilan pertama = pra-cek (pending), kedua = read-back hasil review
    findById: vi.fn().mockResolvedValueOnce(pendingComment()).mockResolvedValue(readBack),
    listByWord: vi.fn(),
    softDelete: vi.fn(),
    listAdmin: vi.fn(),
    review: vi.fn().mockResolvedValue(reviewResult),
  } as unknown as CommentRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return {
    commentRepo,
    auditRepo,
    useCase: new ReviewCommentUseCase(commentRepo, auditRepo as unknown as AuditLogRepository),
  };
}

describe('ReviewCommentUseCase', () => {
  it('approve → review dipanggil, hasil status published, audit old→new status', async () => {
    const { useCase, commentRepo, auditRepo } = makeDeps(true, reviewedComment('published'));
    const result = await useCase.execute({
      commentId: '01JDCOMMENTMAKATN00000000A',
      decision: 'approve',
      reviewerId: REVIEWER,
      requestId: 'req-9',
    });

    expect(commentRepo.review).toHaveBeenCalledWith('01JDCOMMENTMAKATN00000000A', 'approve', REVIEWER);
    expect(result.status).toBe('published');
    expect(result.reviewedBy).toBe(REVIEWER);
    expect(auditRepo.record).toHaveBeenCalledWith({
      userId: REVIEWER,
      action: 'approve',
      entityType: 'comment',
      entityId: '01JDCOMMENTMAKATN00000000A',
      oldData: { status: 'pending_review' },
      newData: { status: 'published' },
      requestId: 'req-9',
    });
  });

  it('reject → status rejected, audit action reject', async () => {
    const { useCase, auditRepo } = makeDeps(true, reviewedComment('rejected'));
    const result = await useCase.execute({
      commentId: '01JDCOMMENTMAKATN00000000A',
      decision: 'reject',
      reviewerId: REVIEWER,
    });
    expect(result.status).toBe('rejected');
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject', newData: { status: 'rejected' } }),
    );
  });

  it('review false (sudah diputuskan / race dua moderator) → 409 COMMENT_ALREADY_REVIEWED, tanpa audit', async () => {
    const { useCase, auditRepo } = makeDeps(false, reviewedComment('published'));
    await expect(
      useCase.execute({ commentId: '01JDCOMMENTMAKATN00000000A', decision: 'approve', reviewerId: REVIEWER }),
    ).rejects.toMatchObject({ errorCode: 'COMMENT_ALREADY_REVIEWED', statusCode: 409 });
    expect(auditRepo.record).not.toHaveBeenCalled();
  });

  it('komentar tidak ada → 404 COMMENT_NOT_FOUND', async () => {
    const commentRepo = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as CommentRepository;
    const useCase = new ReviewCommentUseCase(commentRepo, { record: vi.fn(), list: vi.fn() } as unknown as AuditLogRepository);
    await expect(
      useCase.execute({ commentId: '01JDNGACAK000000000000000X', decision: 'approve', reviewerId: REVIEWER }),
    ).rejects.toMatchObject({ errorCode: 'COMMENT_NOT_FOUND', statusCode: 404 });
  });
});
