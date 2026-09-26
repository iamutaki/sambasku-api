import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type {
  GetCurrentLegalUseCase,
  GetLegalDocumentUseCase,
} from '../../application/use-cases/get-legal.use-cases';
import type {
  ArchiveLegalDocumentUseCase,
  CreateLegalDocumentDraftUseCase,
  ListAdminLegalDocumentsUseCase,
  PublishLegalDocumentUseCase,
  UpdateLegalDocumentDraftUseCase,
} from '../../application/use-cases/admin-legal.use-cases';
import type {
  GetAppSettingsUseCase,
  UpdateAppSettingsUseCase,
} from '../../application/use-cases/app-settings.use-cases';
import type { AcceptLegalUseCase } from '../../application/use-cases/accept-legal.use-case';
import type { LegalDocumentType } from '../../domain/entities/legal-document.entity';
import { mapLegalDocumentAdmin, mapLegalDocumentPublic } from './map-legal';
import type {
  AcceptLegalBody,
  CreateLegalDraftBody,
  ListAdminLegalQuery,
  PatchAppSettingsBody,
  UpdateLegalDraftBody,
} from './validators/legal.validator';

type AdminCtx = Context<{ Variables: AppVariables }>;

export class LegalController {
  constructor(
    private readonly deps: {
      getCurrent: GetCurrentLegalUseCase;
      getDocument: GetLegalDocumentUseCase;
      acceptLegal: AcceptLegalUseCase;
      listAdmin: ListAdminLegalDocumentsUseCase;
      createDraft: CreateLegalDocumentDraftUseCase;
      updateDraft: UpdateLegalDocumentDraftUseCase;
      publish: PublishLegalDocumentUseCase;
      archive: ArchiveLegalDocumentUseCase;
      getSettings: GetAppSettingsUseCase;
      updateSettings: UpdateAppSettingsUseCase;
    },
  ) {}

  async getCurrent(c: Context) {
    const data = await this.deps.getCurrent.execute();
    return c.json({ success: true as const, data });
  }

  async getDocument(c: Context, type: LegalDocumentType, version?: string) {
    const doc = await this.deps.getDocument.execute(type, version);
    return c.json({ success: true as const, data: mapLegalDocumentPublic(doc) });
  }

  async acceptLegal(c: Context, body: AcceptLegalBody) {
    const user = this.requireUser(c as AdminCtx);
    await this.deps.acceptLegal.execute({
      userId: user.user_id,
      consents: body.consents.map((item) => ({
        documentType: item.document_type,
        documentVersion: item.document_version,
      })),
      clientId: body.client_id ?? null,
      source: body.source ?? 'accept_legal',
      requestId: (c as AdminCtx).get('requestId') ?? null,
      ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    });
    return c.json({ success: true as const, data: { accepted: true as const } });
  }

  async listAdmin(c: AdminCtx, query: ListAdminLegalQuery) {
    const result = await this.deps.listAdmin.execute({
      documentType: query.document_type,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: {
        items: result.items.map(mapLegalDocumentAdmin),
        next_cursor: result.nextCursor,
        has_more: result.hasMore,
      },
    });
  }

  async createDraft(c: AdminCtx, body: CreateLegalDraftBody) {
    const user = this.requireUser(c);
    const doc = await this.deps.createDraft.execute({
      documentType: body.document_type,
      version: body.version,
      title: body.title,
      bodyMarkdown: body.body_markdown,
      createdBy: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapLegalDocumentAdmin(doc) }, 201);
  }

  async updateDraft(c: AdminCtx, id: string, body: UpdateLegalDraftBody) {
    const user = this.requireUser(c);
    const doc = await this.deps.updateDraft.execute({
      id,
      title: body.title,
      bodyMarkdown: body.body_markdown,
      updatedBy: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapLegalDocumentAdmin(doc) });
  }

  async publish(c: AdminCtx, id: string) {
    const user = this.requireUser(c);
    const doc = await this.deps.publish.execute({
      id,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapLegalDocumentAdmin(doc) });
  }

  async archive(c: AdminCtx, id: string) {
    const user = this.requireUser(c);
    const doc = await this.deps.archive.execute({
      id,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapLegalDocumentAdmin(doc) });
  }

  async getSettings(c: AdminCtx) {
    const settings = await this.deps.getSettings.execute();
    return c.json({ success: true as const, data: { settings } });
  }

  async patchSettings(c: AdminCtx, body: PatchAppSettingsBody) {
    const user = this.requireUser(c);
    const updated = await this.deps.updateSettings.execute({
      settings: body.settings,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({
      success: true as const,
      data: {
        settings: updated.map((s) => ({
          key: s.key,
          value: s.value,
          updated_at: s.updatedAt.toISOString(),
          updated_by: s.updatedBy,
        })),
      },
    });
  }

  private requireUser(c: AdminCtx): AuthUser {
    const user = c.get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }
}
