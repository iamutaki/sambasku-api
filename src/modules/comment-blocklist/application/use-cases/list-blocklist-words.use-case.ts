import type { CommentBlocklistRepository } from '../../domain/repositories/comment-blocklist.repository';

export class ListBlocklistWordsUseCase {
  constructor(private readonly repo: CommentBlocklistRepository) {}

  execute(params: { limit: number; cursor?: string }) {
    return this.repo.listActive(params);
  }
}
