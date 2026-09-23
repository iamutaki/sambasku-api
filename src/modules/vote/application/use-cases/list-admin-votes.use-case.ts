import { NotFoundError } from '@/shared/errors/app-error';
import type {
  AdminVoteListFilter,
  AdminVoteListResult,
  VoteRepository,
} from '../../domain/repositories/vote.repository';
import { decodeAdminCursor } from '../../domain/repositories/vote.repository';

export interface ListAdminVotesCommand {
  filter: AdminVoteListFilter;
  limit: number;
  cursor?: string | null;
}

/**
 * Pure use case - TIDAK import Drizzle/Hono/Zod. Hanya delegasi ke
 * repository, decode cursor string → AdminVoteCursor jika ada, dan wrap
 * generic cursor error ke NotFoundError ber-code (security boundary).
 */
export class ListAdminVotesUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(cmd: ListAdminVotesCommand): Promise<AdminVoteListResult> {
    let cursor = null;
    if (cmd.cursor) {
      try {
        cursor = decodeAdminCursor(cmd.cursor);
      } catch {
        throw new NotFoundError('INVALID_CURSOR', 'Format paginasi cursor tidak valid');
      }
    }
    return this.voteRepo.listAdmin(cmd.filter, cmd.limit, cursor);
  }
}
