import type { Context } from 'hono';
import { UnauthorizedError, ValidationError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { ImageController } from '@/modules/image/presentation/v1/image.controller';
import {
  isVerifierRole,
  type TranslationHelp,
  type TranslationHelpReply,
} from '../../domain/entities/translation-help.entity';
import type { CreateTranslationHelpUseCase } from '../../application/use-cases/create-translation-help.use-case';
import type { ListPublishedTranslationHelpsUseCase } from '../../application/use-cases/list-published-translation-helps.use-case';
import type { ListMyTranslationHelpsUseCase } from '../../application/use-cases/list-my-translation-helps.use-case';
import type { GetTranslationHelpDetailUseCase } from '../../application/use-cases/get-translation-help-detail.use-case';
import type { ListAdminTranslationHelpsUseCase } from '../../application/use-cases/list-admin-translation-helps.use-case';
import type { ApproveTranslationHelpUseCase } from '../../application/use-cases/approve-translation-help.use-case';
import type { RejectTranslationHelpUseCase } from '../../application/use-cases/reject-translation-help.use-case';
import type { TakedownTranslationHelpUseCase } from '../../application/use-cases/takedown-translation-help.use-case';
import type { CreateTranslationHelpReplyUseCase } from '../../application/use-cases/create-translation-help-reply.use-case';
import type { DeleteTranslationHelpReplyUseCase } from '../../application/use-cases/delete-translation-help-reply.use-case';
import type { PinTranslationHelpReplyUseCase } from '../../application/use-cases/pin-translation-help-reply.use-case';
import type { TakedownTranslationHelpReplyUseCase } from '../../application/use-cases/takedown-translation-help-reply.use-case';
import type {
  CreateTranslationHelpBody,
  CreateTranslationHelpReplyBody,
  ListAdminTranslationHelpsQuery,
  ListMyTranslationHelpsQuery,
  ListTranslationHelpsQuery,
  PinTranslationHelpReplyBody,
  RejectTranslationHelpBody,
} from './validators/translation-help.validator';

function redactReplyBody(reply: TranslationHelpReply): string | null {
  return reply.status === 'published' ? reply.body : null;
}

function toPublicImages(help: TranslationHelp) {
  return help.images
    .filter((img) => img.publicUrl)
    .map((img) => ({ public_url: img.publicUrl as string }));
}

function toOwnerImages(help: TranslationHelp) {
  return help.images.map((img) => ({
    url: img.url,
    provider_file_id: img.providerFileId,
    public_url: img.publicUrl,
  }));
}

function toAdminImages(help: TranslationHelp) {
  return toOwnerImages(help);
}

export function toPublicItem(help: TranslationHelp) {
  return {
    id: help.id,
    user_id: help.userId,
    username: help.username,
    body: help.body,
    images: toPublicImages(help),
    status: 'published' as const,
    pinned_reply_id: help.pinnedReplyId,
    created_at: help.createdAt.toISOString(),
  };
}

export function toOwnerItem(help: TranslationHelp) {
  return {
    id: help.id,
    user_id: help.userId,
    username: help.username,
    body: help.body,
    images: toOwnerImages(help),
    status: help.status,
    rejection_note: help.rejectionNote,
    pinned_reply_id: help.pinnedReplyId,
    reviewed_at: help.reviewedAt?.toISOString() ?? null,
    created_at: help.createdAt.toISOString(),
    updated_at: help.updatedAt?.toISOString() ?? null,
  };
}

export function toAdminItem(help: TranslationHelp) {
  return {
    id: help.id,
    user_id: help.userId,
    username: help.username,
    body: help.body,
    images: toAdminImages(help),
    status: help.status,
    rejection_note: help.rejectionNote,
    reviewed_by: help.reviewedBy,
    reviewed_at: help.reviewedAt?.toISOString() ?? null,
    pinned_reply_id: help.pinnedReplyId,
    created_at: help.createdAt.toISOString(),
    updated_at: help.updatedAt?.toISOString() ?? null,
  };
}

function toPublicReply(reply: TranslationHelpReply, pinnedReplyId: string | null) {
  return {
    id: reply.id,
    user_id: reply.userId,
    username: reply.username,
    body: redactReplyBody(reply),
    status: reply.status,
    is_verifier: isVerifierRole(reply.userRole),
    is_pinned: pinnedReplyId === reply.id,
    created_at: reply.createdAt.toISOString(),
  };
}

function toAdminReply(reply: TranslationHelpReply, pinnedReplyId: string | null) {
  return {
    ...toPublicReply(reply, pinnedReplyId),
    body: reply.body,
    body_original: reply.bodyOriginal,
    is_censored: reply.bodyOriginal != null,
    reviewed_by: reply.reviewedBy,
    reviewed_at: reply.reviewedAt?.toISOString() ?? null,
  };
}

async function parseApproveFiles(c: Context): Promise<{
  files: Uint8Array[];
  mimeTypes: (string | null)[];
}> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return { files: [], mimeTypes: [] };
  }

  const body = await c.req.parseBody({ all: true });
  const files: Uint8Array[] = [];
  const mimeTypes: (string | null)[] = [];

  const collect = async (part: unknown) => {
    if (!part || typeof part === 'string') return;
    const file = part as File;
    files.push(new Uint8Array(await file.arrayBuffer()));
    mimeTypes.push(file.type || null);
  };

  // file_0, file_1, ... lalu fallback single `file`
  let idx = 0;
  while (true) {
    const key = `file_${idx}`;
    if (!(key in body)) break;
    await collect(body[key]);
    idx += 1;
  }

  if (files.length === 0 && 'file' in body) {
    const part = body['file'];
    if (Array.isArray(part)) {
      for (const item of part) await collect(item);
    } else {
      await collect(part);
    }
  }

  return { files, mimeTypes };
}

export class TranslationHelpController {
  constructor(
    private readonly deps: {
      create: CreateTranslationHelpUseCase;
      listPublished: ListPublishedTranslationHelpsUseCase;
      listMine: ListMyTranslationHelpsUseCase;
      getDetail: GetTranslationHelpDetailUseCase;
      listAdmin: ListAdminTranslationHelpsUseCase;
      approve: ApproveTranslationHelpUseCase;
      reject: RejectTranslationHelpUseCase;
      takedown: TakedownTranslationHelpUseCase;
      createReply: CreateTranslationHelpReplyUseCase;
      deleteReply: DeleteTranslationHelpReplyUseCase;
      pinReply: PinTranslationHelpReplyUseCase;
      takedownReply: TakedownTranslationHelpReplyUseCase;
      imageController: ImageController;
    },
  ) {}

  uploadCredentials(c: Context, folder: string) {
    return this.deps.imageController.uploadCredentials(c, folder);
  }

  async create(c: Context, body: CreateTranslationHelpBody) {
    const user = this.requireUser(c);
    const row = await this.deps.create.execute({
      userId: user.user_id,
      body: body.body ?? null,
      images: (body.images ?? []).map((img) => ({
        url: img.url,
        providerFileId: img.provider_file_id,
        publicUrl: null,
      })),
      requestId: this.requestId(c),
    });
    return c.json(
      {
        success: true as const,
        data: {
          id: row.id,
          status: 'pending_review' as const,
          submitted_at: row.createdAt.toISOString(),
        },
      },
      200,
    );
  }

  async listPublished(c: Context, query: ListTranslationHelpsQuery) {
    const page = await this.deps.listPublished.execute({
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map(toPublicItem),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async listMine(c: Context, query: ListMyTranslationHelpsQuery) {
    const user = this.requireUser(c);
    const page = await this.deps.listMine.execute({
      userId: user.user_id,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map(toOwnerItem),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async getDetail(c: Context, id: string) {
    const user = this.optionalUser(c);
    const { help, replies } = await this.deps.getDetail.execute({
      id,
      viewerUserId: user?.user_id ?? null,
    });

    const isOwner = user?.user_id === help.userId;
    if (help.status === 'published') {
      return c.json({
        success: true as const,
        data: {
          ...toPublicItem(help),
          replies: replies.map((r) => toPublicReply(r, help.pinnedReplyId)),
        },
      });
    }

    // Owner view (pending / rejected / taken_down)
    if (!isOwner) {
      // use-case already 404s; defensive
      throw new ValidationError([{ field: 'id', message: 'Bantuan terjemahan tidak ditemukan' }]);
    }

    return c.json({
      success: true as const,
      data: {
        ...toOwnerItem(help),
        replies: replies.map((r) => toPublicReply(r, help.pinnedReplyId)),
      },
    });
  }

  async listAdmin(c: Context, query: ListAdminTranslationHelpsQuery) {
    const page = await this.deps.listAdmin.execute({
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map(toAdminItem),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async getAdminDetail(c: Context, id: string) {
    const { help, replies } = await this.deps.getDetail.execute({ id, asAdmin: true });
    return c.json({
      success: true as const,
      data: {
        ...toAdminItem(help),
        replies: replies.map((r) => toAdminReply(r, help.pinnedReplyId)),
      },
    });
  }

  async approve(c: Context, id: string) {
    const user = this.requireUser(c);
    const { files, mimeTypes } = await parseApproveFiles(c);
    const row = await this.deps.approve.execute({
      id,
      actorId: user.user_id,
      censoredFiles: files.length > 0 ? files : undefined,
      censoredMimeTypes: mimeTypes.length > 0 ? mimeTypes : undefined,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toAdminItem(row) });
  }

  async reject(c: Context, id: string, body: RejectTranslationHelpBody) {
    const user = this.requireUser(c);
    const row = await this.deps.reject.execute({
      id,
      actorId: user.user_id,
      note: body.note,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toAdminItem(row) });
  }

  async takedown(c: Context, id: string) {
    const user = this.requireUser(c);
    const row = await this.deps.takedown.execute({
      id,
      actorId: user.user_id,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toAdminItem(row) });
  }

  async createReply(c: Context, helpId: string, body: CreateTranslationHelpReplyBody) {
    const user = this.requireUser(c);
    const reply = await this.deps.createReply.execute({
      helpId,
      userId: user.user_id,
      body: body.body,
      requestId: this.requestId(c),
    });
    const help = await this.deps.getDetail.execute({
      id: helpId,
      viewerUserId: user.user_id,
    });
    return c.json(
      {
        success: true as const,
        data: toPublicReply(reply, help.help.pinnedReplyId),
      },
      201,
    );
  }

  async deleteReply(c: Context, replyId: string) {
    const user = this.requireUser(c);
    await this.deps.deleteReply.execute({
      replyId,
      actorId: user.user_id,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: null });
  }

  async pinReply(c: Context, helpId: string, body: PinTranslationHelpReplyBody) {
    const user = this.requireUser(c);
    const row = await this.deps.pinReply.execute({
      helpId,
      replyId: body.reply_id,
      actorId: user.user_id,
      requestId: this.requestId(c),
    });
    return c.json({ success: true as const, data: toAdminItem(row) });
  }

  async takedownReply(c: Context, replyId: string) {
    const user = this.requireUser(c);
    const reply = await this.deps.takedownReply.execute({
      replyId,
      reviewerId: user.user_id,
      requestId: this.requestId(c),
    });
    return c.json({
      success: true as const,
      data: toAdminReply(reply, null),
    });
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
