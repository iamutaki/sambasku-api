import type { Comment, CursorPage } from '../../domain/entities/comment.entity';
import type { CommentRepository, ListAdminCommentsParams } from '../../domain/repositories/comment.repository';

// Antrean moderasi (09-api-comment.md): semua status (belum terhapus),
// filter status optional (default pending_review di route), + username.
export class ListAdminCommentsUseCase {
  constructor(private readonly commentRepo: CommentRepository) {}

  async execute(params: ListAdminCommentsParams): Promise<CursorPage<Comment>> {
    return this.commentRepo.listAdmin(params);
  }
}
