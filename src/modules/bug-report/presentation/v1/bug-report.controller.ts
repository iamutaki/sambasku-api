import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { BugReport } from '../../domain/entities/bug-report.entity';
import type { CreateBugReportUseCase } from '../../application/use-cases/create-bug-report.use-case';
import type { ListBugReportsUseCase } from '../../application/use-cases/list-bug-reports.use-case';
import type { ResolveBugReportUseCase } from '../../application/use-cases/resolve-bug-report.use-case';
import type { ImageController } from '@/modules/image/presentation/v1/image.controller';
import type {
  CreateBugReportBody,
  ListBugReportsQuery,
  ResolveBugReportBody,
} from './validators/bug-report.validator';

export function toAdminItem(row: BugReport) {
  return {
    id: row.id,
    user_id: row.userId,
    username: row.username,
    device_id: row.deviceId,
    description: row.description,
    images: row.images.map((img) => ({
      url: img.url,
      provider_file_id: img.providerFileId,
    })),
    app_version: row.appVersion,
    platform: row.platform,
    status: row.status,
    resolution_note: row.resolutionNote,
    resolved_by: row.resolvedBy,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_by: row.createdBy,
    updated_by: row.updatedBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}

export class BugReportController {
  constructor(
    private readonly deps: {
      create: CreateBugReportUseCase;
      list: ListBugReportsUseCase;
      resolve: ResolveBugReportUseCase;
      imageController: ImageController;
    },
  ) {}

  uploadCredentials(c: Context, folder: string) {
    return this.deps.imageController.uploadCredentials(c, folder);
  }

  async create(c: Context, body: CreateBugReportBody, deviceId: string | null) {
    const user = this.optionalUser(c);
    const row = await this.deps.create.execute({
      userId: user?.user_id ?? null,
      deviceId,
      description: body.description,
      images: body.images.map((img) => ({
        url: img.url,
        providerFileId: img.provider_file_id,
      })),
      appVersion: body.app_version?.trim() ? body.app_version.trim() : null,
      platform: body.platform ?? null,
      requestId: this.requestId(c),
    });
    return c.json(
      {
        success: true as const,
        data: {
          id: row.id,
          status: 'open' as const,
          submitted_at: row.createdAt.toISOString(),
          is_anonymous: row.userId === null,
        },
      },
      200,
    );
  }

  async list(c: Context, query: ListBugReportsQuery) {
    const { items, nextCursor, hasMore } = await this.deps.list.execute({
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: items.map(toAdminItem),
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    });
  }

  async resolve(c: Context, id: string, body: ResolveBugReportBody) {
    const user = this.requireUser(c);
    const row = await this.deps.resolve.execute({
      id,
      actorId: user.user_id,
      status: body.status,
      note: body.note ?? null,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toAdminItem(row) });
  }

  private optionalUser(c: Context): AuthUser | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('user');
  }

  private requireUser(c: Context): AuthUser {
    const user = this.optionalUser(c);
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }

  private requestId(c: Context): string | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('requestId');
  }
}
