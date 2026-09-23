import type { Comment, CursorPage } from '../../domain/entities/comment.entity';
import type { CommentRepository, ListAdminCommentsParams } from '../../domain/repositories/comment.repository';

// List komentar admin (09-api-comment.md): filter status optional,
// body asli (tidak di-redact), + username.
export class ListAdminCommentsUseCase {
  constructor(private readonly commentRepo: CommentRepository) {}

  async execute(params: ListAdminCommentsParams): Promise<CursorPage<Comment>> {
    return this.commentRepo.listAdmin(params);
  }
}
