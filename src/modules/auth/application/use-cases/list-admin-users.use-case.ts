import type { User } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository';

export interface ListAdminUsersCommand {
  q?: string;
  role?: User['role'];
  canContribute?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListAdminUsersResult {
  items: User[];
  meta: { limit: number; next_cursor: string | null; has_more: boolean };
}

// Hanya untuk role admin & root - validasi role di layer routes,
// bukan di use case (biarkan use case reusable untuk testing/command dll).
export class ListAdminUsersUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(cmd: ListAdminUsersCommand): Promise<ListAdminUsersResult> {
    const limit = cmd.limit && cmd.limit >= 1 && cmd.limit <= 100 ? cmd.limit : 20;
    const { items, nextCursor, hasMore } = await this.userRepo.list({
      q: cmd.q,
      role: cmd.role,
      canContribute: cmd.canContribute,
      limit,
      cursor: cmd.cursor,
    });
    return {
      items,
      meta: { limit, next_cursor: nextCursor, has_more: hasMore },
    };
  }
}
