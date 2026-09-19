import { describe, it, expect, vi } from 'vitest';
import { DeleteCommentUseCase } from '../../application/use-cases/delete-comment.use-case';
import type { CommentRepository } from '../../domain/repositories/comment.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Comment } from '../../domain/entities/comment.entity';

const AUTHOR = '01JDUSERKONTRIB0000000000A';
const OTHER = '01JDUSERLAIN00000000000000A';
const ADMIN = '01JDUSERADMIN00000000000000A';

function makeComment(userId: string): Comment {
  return {
    id: '01JDCOMMENTMAKATN00000000A',
    wordId: '01JDWORDMAKATN0000000000A',
    wordLemma: 'makatn',
    userId,
    username: 'penulis',
    body: 'komentar',
    status: 'published',
    reviewedBy: ADMIN,
    reviewedAt: new Date(),
    createdAt: new Date(),
  };
}

function makeDeps(comment: Comment | null, softDeleteResult = true) {
  const commentRepo = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(comment),
    listByWord: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(softDeleteResult),
    listAdmin: vi.fn(),
    review: vi.fn(),
  } as unknown as CommentRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return {
    commentRepo,
    auditRepo,
    useCase: new DeleteCommentUseCase(commentRepo, auditRepo as unknown as AuditLogRepository),
  };
}

describe('DeleteCommentUseCase', () => {
  it('PENULIS sendiri → soft-delete + audit delete', async () => {
    const { useCase, commentRepo, auditRepo } = makeDeps(makeComment(AUTHOR));
    await useCase.execute({ commentId: '01JDCOMMENTMAKATN00000000A', actorId: AUTHOR, role: 'contributor' });

    expect(commentRepo.softDelete).toHaveBeenCalledWith('01JDCOMMENTMAKATN00000000A', AUTHOR);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', entityType: 'comment', oldData: expect.objectContaining({ body: 'komentar' }) }),
    );
  });

  it('ADMIN atas komentar orang lain → boleh (verifikator)', async () => {
    const { useCase, commentRepo } = makeDeps(makeComment(AUTHOR));
    await useCase.execute({ commentId: '01JDCOMMENTMAKATN00000000A', actorId: ADMIN, role: 'admin' });
    expect(commentRepo.softDelete).toHaveBeenCalledWith('01JDCOMMENTMAKATN00000000A', ADMIN);
  });

  it('user lain (contributor) → 403 FORBIDDEN, tanpa softDelete', async () => {
    const { useCase, commentRepo } = makeDeps(makeComment(AUTHOR));
    await expect(
      useCase.execute({ commentId: '01JDCOMMENTMAKATN00000000A', actorId: OTHER, role: 'contributor' }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN', statusCode: 403 });
    expect(commentRepo.softDelete).not.toHaveBeenCalled();
  });

  it('komentar tidak ada → 404 COMMENT_NOT_FOUND', async () => {
    const { useCase } = makeDeps(null);
    await expect(
      useCase.execute({ commentId: '01JDCOMMENTNGACAK000000000X', actorId: AUTHOR, role: 'contributor' }),
    ).rejects.toMatchObject({ errorCode: 'COMMENT_NOT_FOUND', statusCode: 404 });
  });
});
