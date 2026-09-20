import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { VerifierApplication } from '../../domain/entities/verifier-application.entity';
import type { CreateVerifierApplicationUseCase } from '../../application/use-cases/create-verifier-application.use-case';
import type { GetMyVerifierApplicationUseCase } from '../../application/use-cases/get-my-verifier-application.use-case';
import type { ResubmitVerifierApplicationUseCase } from '../../application/use-cases/resubmit-verifier-application.use-case';
import type { ListVerifierApplicationsUseCase } from '../../application/use-cases/list-verifier-applications.use-case';
import type { GetVerifierApplicationDetailUseCase } from '../../application/use-cases/get-verifier-application-detail.use-case';
import type { ApproveVerifierApplicationUseCase } from '../../application/use-cases/approve-verifier-application.use-case';
import type { RejectVerifierApplicationUseCase } from '../../application/use-cases/reject-verifier-application.use-case';
import type {
  ListVerifierApplicationsQuery,
  RejectVerifierApplicationBody,
  SubmitVerifierApplicationBody,
} from './validators/verifier-application.validator';

function toMine(row: VerifierApplication) {
  return {
    id: row.id,
    status: row.status,
    phone: row.phone,
    address: row.address,
    social_links: row.socialLinks,
    admin_comment: row.adminComment,
    reviewed_at: row.reviewedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}

export class VerifierApplicationController {
  constructor(
    private readonly deps: {
      create: CreateVerifierApplicationUseCase;
      getMine: GetMyVerifierApplicationUseCase;
      resubmit: ResubmitVerifierApplicationUseCase;
      list: ListVerifierApplicationsUseCase;
      getDetail: GetVerifierApplicationDetailUseCase;
      approve: ApproveVerifierApplicationUseCase;
      reject: RejectVerifierApplicationUseCase;
    },
  ) {}

  async create(c: Context, body: SubmitVerifierApplicationBody) {
    const user = this.requireUser(c);
    const row = await this.deps.create.execute({
      userId: user.user_id,
      role: user.role,
      phone: body.phone,
      address: body.address,
      socialLinks: body.social_links,
    });
    return c.json({ success: true as const, data: toMine(row) }, 201);
  }

  async me(c: Context) {
    const user = this.requireUser(c);
    const row = await this.deps.getMine.execute(user.user_id);
    return c.json({ success: true as const, data: toMine(row) });
  }

  async resubmit(c: Context, body: SubmitVerifierApplicationBody) {
    const user = this.requireUser(c);
    const row = await this.deps.resubmit.execute({
      userId: user.user_id,
      role: user.role,
      phone: body.phone,
      address: body.address,
      socialLinks: body.social_links,
    });
    return c.json({ success: true as const, data: toMine(row) });
  }

  async list(c: Context, query: ListVerifierApplicationsQuery) {
    const { items, nextCursor, hasMore } = await this.deps.list.execute({
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: items.map((item) => ({
        id: item.id,
        user_id: item.userId,
        username: item.username,
        phone: item.phone,
        status: item.status,
        created_at: item.createdAt.toISOString(),
      })),
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    });
  }

  async detail(c: Context, id: string) {
    const row = await this.deps.getDetail.execute(id);
    return c.json({
      success: true as const,
      data: {
        id: row.id,
        user_id: row.userId,
        username: row.username,
        status: row.status,
        phone: row.phone,
        address: row.address,
        social_links: row.socialLinks,
        admin_comment: row.adminComment,
        reviewed_by: row.reviewedBy,
        reviewed_at: row.reviewedAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt?.toISOString() ?? null,
      },
    });
  }

  async approve(c: Context, id: string) {
    const user = this.requireUser(c);
    const result = await this.deps.approve.execute({
      applicationId: id,
      actorId: user.user_id,
      actorRole: user.role,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: result });
  }

  async reject(c: Context, id: string, body: RejectVerifierApplicationBody) {
    const user = this.requireUser(c);
    const result = await this.deps.reject.execute({
      applicationId: id,
      actorId: user.user_id,
      comment: body.comment,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: result });
  }

  private requireUser(c: Context): AuthUser {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }

  private requestId(c: Context): string | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('requestId');
  }
}
