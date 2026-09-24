import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { WordReport } from '../../domain/entities/word-report.entity';
import type { CreateWordReportUseCase } from '../../application/use-cases/create-word-report.use-case';
import type { ListWordReportsUseCase } from '../../application/use-cases/list-word-reports.use-case';
import type {
  ResolveWordReportUseCase,
  TakedownWordReportUseCase,
  FlagViolentImageReportUseCase,
} from '../../application/use-cases/resolve-word-report.use-case';
import type {
  CreateWordReportBody,
  ListWordReportsQuery,
  ResolveWordReportBody,
  TakedownWordBody,
} from './validators/word-report.validator';

export function toWordReportItem(row: WordReport) {
  return {
    id: row.id,
    word_id: row.wordId,
    image_id: row.imageId,
    lemma: row.wordLemma,
    word_status: row.wordStatus,
    user_id: row.userId,
    username: row.username,
    reason_code: row.reasonCode,
    note: row.note,
    status: row.status,
    resolution: row.resolution,
    resolution_note: row.resolutionNote,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export class WordReportController {
  constructor(
    private readonly deps: {
      create: CreateWordReportUseCase;
      list: ListWordReportsUseCase;
      resolve: ResolveWordReportUseCase;
      takedown: TakedownWordReportUseCase;
      flagViolentImage: FlagViolentImageReportUseCase;
    },
  ) {}

  async create(c: Context, wordId: string, body: CreateWordReportBody) {
    const user = this.requireUser(c);
    const row = await this.deps.create.execute({
      wordId,
      imageId: body.image_id,
      userId: user.user_id,
      reasonCode: body.reason_code,
      note: body.note,
      requestId: this.requestId(c),
    });
    return c.json(
      {
        success: true as const,
        data: {
          id: row.id,
          word_id: row.wordId,
          image_id: row.imageId,
          status: 'open' as const,
          created_at: row.createdAt.toISOString(),
        },
      },
      201,
    );
  }

  async list(c: Context, query: ListWordReportsQuery) {
    const page = await this.deps.list.execute({
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map(toWordReportItem),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async get(c: Context, id: string) {
    const found = await this.deps.list.getById(id);
    return c.json({ success: true as const, data: toWordReportItem(found) });
  }

  async dismiss(c: Context, id: string, body: ResolveWordReportBody) {
    return this.resolve(c, id, 'dismissed', body.note);
  }

  async markCorrected(c: Context, id: string, body: ResolveWordReportBody) {
    return this.resolve(c, id, 'corrected', body.note);
  }

  async takedown(c: Context, id: string, body: TakedownWordBody) {
    const user = this.requireUser(c);
    await this.deps.takedown.execute({
      id,
      actorId: user.user_id,
      reasonCode: body.reason_code,
      note: body.note,
      requestId: this.requestId(c),
    });
    const found = await this.deps.list.getById(id);
    return c.json({ success: true as const, data: toWordReportItem(found) });
  }

  async flagViolentImage(c: Context, id: string, body: ResolveWordReportBody) {
    const user = this.requireUser(c);
    const row = await this.deps.flagViolentImage.execute({
      id,
      actorId: user.user_id,
      note: body.note,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toWordReportItem(row) });
  }

  private async resolve(
    c: Context,
    id: string,
    resolution: 'dismissed' | 'corrected',
    note: string | undefined,
  ) {
    const user = this.requireUser(c);
    const row = await this.deps.resolve.execute({
      id,
      actorId: user.user_id,
      resolution,
      note,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toWordReportItem(row) });
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
