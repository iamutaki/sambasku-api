import type { Comment, CursorPage } from '../../domain/entities/comment.entity';
import type { CommentRepository, ListMyCommentsParams } from '../../domain/repositories/comment.repository';

// Komentar milik penulis (27-api-my-comments.md): semua status kecuali
// soft-delete purge. Body penuh (admin/self view).
export class ListMyCommentsUseCase {
  constructor(private readonly commentRepo: CommentRepository) {}

  async execute(params: ListMyCommentsParams): Promise<CursorPage<Comment>> {
    return this.commentRepo.listByUser(params);
  }
}
