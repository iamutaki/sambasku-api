import type { CommentBlocklistRepository } from '../../domain/repositories/comment-blocklist.repository';

export class ListBlocklistWordsUseCase {
  constructor(private readonly repo: CommentBlocklistRepository) {}

  execute(params: { limit: number; cursor?: string; q?: string }) {
    const q = params.q?.trim();
    return this.repo.listActive({
      limit: params.limit,
      cursor: params.cursor,
      q: q ? q : undefined,
    });
  }
}
