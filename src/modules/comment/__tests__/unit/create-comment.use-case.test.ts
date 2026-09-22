import { describe, it, expect, vi } from 'vitest';
import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import { CreateCommentUseCase } from '../../application/use-cases/create-comment.use-case';
import { DeleteCommentUseCase } from '../../application/use-cases/delete-comment.use-case';
import { TakedownCommentUseCase } from '../../application/use-cases/takedown-comment.use-case';
import type { Comment } from '../../domain/entities/comment.entity';
import { applyBlocklistFilter } from '@/modules/comment-blocklist/application/utils/apply-blocklist-filter';

const WORD = '01JDWORDMAKATN0000000000A';
const AUTHOR = '01JDUSERAUTHOR00000000000A';
const ADMIN = '01JDUSERADMIN000000000000A';
const OTHER = '01JDUSEROTHER000000000000A';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: '01JDCOMMENTMAKATN00000000A',
    wordId: WORD,
    wordLemma: 'makatn',
    userId: AUTHOR,
    username: 'budi',
    body: 'halo',
    bodyOriginal: null,
    status: 'published',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-09-18T10:00:00Z'),
    ...overrides,
  };
}

describe('applyBlocklistFilter', () => {
  it('mengganti whole-word case-insensitive dengan ***', () => {
    expect(applyBlocklistFilter('Ini Bodoh sekali', ['bodoh'])).toBe('Ini *** sekali');
    expect(applyBlocklistFilter('bodohan tetap', ['bodoh'])).toBe('bodohan tetap');
  });
});

describe('CreateCommentUseCase', () => {
  it('word hilang → 404; sukses → published + body terfilter + audit', async () => {
    const commentRepo = {
      create: vi.fn().mockResolvedValue(makeComment({ body: 'Ini *** sekali' })),
      findById: vi.fn().mockResolvedValue(makeComment({ body: 'Ini *** sekali' })),
    };
    const wordRepo = { findById: vi.fn().mockResolvedValue(null) };
    const auditRepo = { record: vi.fn() };
    const blocklistRepo = { listAllActiveWords: vi.fn().mockResolvedValue(['bodoh']) };

    const uc = new CreateCommentUseCase(
      commentRepo as never,
      wordRepo as never,
      auditRepo as never,
      blocklistRepo as never,
    );

    await expect(
      uc.execute({ wordId: WORD, userId: AUTHOR, role: 'contributor', body: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    wordRepo.findById.mockResolvedValue({ id: WORD });
    const created = await uc.execute({
      wordId: WORD,
      userId: AUTHOR,
      role: 'contributor',
      body: 'Ini Bodoh sekali',
    });
    expect(commentRepo.create).toHaveBeenCalledWith({
      wordId: WORD,
      userId: AUTHOR,
      body: 'Ini *** sekali',
      bodyOriginal: 'Ini Bodoh sekali',
    });
    expect(created.status).toBe('published');
    expect(auditRepo.record).toHaveBeenCalled();
  });
});

describe('DeleteCommentUseCase', () => {
  it('penulis OK; non-penulis 403; admin juga 403 (pakai takedown)', async () => {
    const comment = makeComment();
    const commentRepo = {
      findById: vi.fn().mockResolvedValue(comment),
      markDeletedByAuthor: vi.fn().mockResolvedValue(true),
    };
    const auditRepo = { record: vi.fn() };
    const uc = new DeleteCommentUseCase(commentRepo as never, auditRepo as never);

    await uc.execute({ commentId: comment.id, actorId: AUTHOR, role: 'contributor' });
    expect(commentRepo.markDeletedByAuthor).toHaveBeenCalledWith(comment.id, AUTHOR);

    await expect(
      uc.execute({ commentId: comment.id, actorId: OTHER, role: 'contributor' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      uc.execute({ commentId: comment.id, actorId: ADMIN, role: 'admin' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('TakedownCommentUseCase', () => {
  it('sukses taken_down; race → 409 COMMENT_ALREADY_MODERATED', async () => {
    const comment = makeComment();
    const commentRepo = {
      findById: vi
        .fn()
        .mockResolvedValueOnce(comment)
        .mockResolvedValueOnce({ ...comment, status: 'taken_down', reviewedBy: ADMIN, reviewedAt: new Date() }),
      takedown: vi.fn().mockResolvedValue(true),
    };
    const auditRepo = { record: vi.fn() };
    const uc = new TakedownCommentUseCase(commentRepo as never, auditRepo as never);

    const result = await uc.execute({ commentId: comment.id, reviewerId: ADMIN });
    expect(result.status).toBe('taken_down');
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'takedown', newData: { status: 'taken_down' } }),
    );

    commentRepo.takedown.mockResolvedValue(false);
    commentRepo.findById.mockResolvedValue(comment);
    await expect(uc.execute({ commentId: comment.id, reviewerId: ADMIN })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
