import type { Context } from 'hono';
import type { ListAdminUsersUseCase } from '../../application/use-cases/list-admin-users.use-case';
import type { UpdateUserRoleUseCase } from '../../application/use-cases/update-user-role.use-case';
import type { SetCanContributeUseCase } from '../../application/use-cases/set-can-contribute.use-case';
import type { UserRole } from '../../domain/entities/user.entity';
import type { AppVariables } from '@/shared/types';
import type { ListAdminUsersQuery, UpdateUserRoleBody } from './validators/admin-users.validator';

type AdminCtx = Context<{ Variables: AppVariables }>;

export class AdminUsersController {
  constructor(
    private readonly deps: {
      list: ListAdminUsersUseCase;
      updateRole: UpdateUserRoleUseCase;
      setCanContribute: SetCanContributeUseCase;
    },
  ) {}

  async list(c: AdminCtx, query: ListAdminUsersQuery) {
    const { items, meta } = await this.deps.list.execute({
      q: query.q,
      role: query.role as UserRole | undefined,
      canContribute: query.can_contribute,
      limit: query.limit,
      cursor: query.cursor,
    });

    return c.json({
      success: true as const,
      data: items.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        is_active: u.isActive,
        can_contribute: u.canContribute,
        created_at: u.createdAt.toISOString(),
        updated_at: u.updatedAt ? u.updatedAt.toISOString() : null,
      })),
      meta,
    });
  }

  async updateRole(
    c: AdminCtx,
    targetId: string,
    body: UpdateUserRoleBody,
  ) {
    const user = c.get('user')!;
    const requestId = c.get('requestId') ?? null;

    const result = await this.deps.updateRole.execute({
      targetUserId: targetId,
      newRole: body.role as UserRole,
      actorId: user.user_id,
      actorRole: user.role as UserRole,
      requestId,
    });

    return c.json({ success: true as const, data: result });
  }

  async setCanContribute(c: AdminCtx, targetId: string, canContribute: boolean) {
    const user = c.get('user')!;
    const result = await this.deps.setCanContribute.execute({
      targetUserId: targetId,
      canContribute,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: { id: result.id, can_contribute: result.canContribute } });
  }
}
