import type { Context } from 'hono';
import { UnauthorizedError, ValidationError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import { toCreateWordDto } from '@/modules/word/presentation/v1/map-create-word';
import type { ListContributionsUseCase } from '../../application/use-cases/list-contributions.use-case';
import type { GetContributionDetailUseCase } from '../../application/use-cases/get-contribution-detail.use-case';
import type {
  CensoredImageFile,
  ReviewContributionUseCase,
} from '../../application/use-cases/review-contribution.use-case';
import type { CorrectContributionUseCase } from '../../application/use-cases/correct-contribution.use-case';
import {
  approveContributionSchema,
  type ApproveContributionBody,
  type CorrectContributionBody,
  type ListContributionsQueryBody,
} from './validators/contribution.validator';

/**
 * JSON body atau multipart: comment, image_decisions (JSON string),
 * file_<imageId> = bytes sensor opsional.
 */
async function parseApprovePayload(c: Context): Promise<{
  body: ApproveContributionBody;
  censoredFiles: Record<string, CensoredImageFile>;
}> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = approveContributionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => ({
          field: i.path.join('.') || 'body',
          message: i.message,
        })),
      );
    }
    return { body: parsed.data, censoredFiles: {} };
  }

  const form = await c.req.parseBody({ all: true });
  const commentRaw = form['comment'];
  const decisionsRaw = form['image_decisions'];
  let imageDecisions: unknown;
  if (typeof decisionsRaw === 'string' && decisionsRaw.trim()) {
    try {
      imageDecisions = JSON.parse(decisionsRaw) as unknown;
    } catch {
      throw new ValidationError([
        { field: 'image_decisions', message: 'Format keputusan foto tidak valid' },
      ]);
    }
  }
  const rawBody = {
    comment: typeof commentRaw === 'string' ? commentRaw : undefined,
    image_decisions: imageDecisions,
  };
  const parsed = approveContributionSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        field: i.path.join('.') || 'body',
        message: i.message,
      })),
    );
  }

  const censoredFiles: Record<string, CensoredImageFile> = {};
  for (const [key, part] of Object.entries(form)) {
    if (!key.startsWith('file_') || typeof part === 'string') continue;
    const imageId = key.slice('file_'.length);
    if (!imageId || imageId.length !== 26) continue;
    const file = part as File;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) continue;
    censoredFiles[imageId] = { bytes, mimeType: file.type || null };
  }

  return { body: parsed.data, censoredFiles };
}

export class ContributionController {
  constructor(
    private readonly deps: {
      list: ListContributionsUseCase;
      getDetail: GetContributionDetailUseCase;
      review: ReviewContributionUseCase;
      correct: CorrectContributionUseCase;
      /** provider gambar aktif - untuk mapping koreksi entity word */
      imageProviderName: string;
    },
  ) {}

  async list(c: Context, query: ListContributionsQueryBody) {
    const { items, nextCursor, hasMore } = await this.deps.list.execute({
      status: query.status,
      entityType: query.entity_type,
      action: query.action,
      wordId: query.word_id,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: items.map((item) => ({
        id: item.id,
        user_id: item.userId,
        contributor_username: item.contributorUsername,
        entity_type: item.entityType,
        entity_id: item.entityId,
        action: item.action,
        status: item.status,
        created_at: item.createdAt.toISOString(),
        word_lemma: item.wordLemma,
        search_miss_id: item.searchMissId,
        search_miss_term: item.searchMissTerm,
        search_miss_direction: item.searchMissDirection,
      })),
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    });
  }

  async detail(c: Context, id: string) {
    const { contribution, review, entity } = await this.deps.getDetail.execute(id);
    return c.json({
      success: true as const,
      data: {
        contribution: {
          id: contribution.id,
          user_id: contribution.userId,
          contributor_username: contribution.contributorUsername,
          entity_type: contribution.entityType,
          entity_id: contribution.entityId,
          action: contribution.action,
          status: contribution.status,
          created_at: contribution.createdAt.toISOString(),
          word_lemma: contribution.wordLemma,
          search_miss_id: contribution.searchMissId,
          search_miss_term: contribution.searchMissTerm,
          search_miss_direction: contribution.searchMissDirection,
        },
        review: review
          ? {
              reviewer_id: review.reviewerId,
              status: review.status,
              comment: review.comment,
              created_at: review.createdAt.toISOString(),
            }
          : null,
        // payload polymorphic - snake_case untuk entity anak; word detail
        // bentuknya sama seperti GET /words/:id (semua status)
        entity: serializeEntity(entity),
      },
    });
  }

  async approve(c: Context, id: string) {
    const actor = this.requireActor(c);
    const { body, censoredFiles } = await parseApprovePayload(c);
    const outcome = await this.deps.review.execute({
      contributionId: id,
      decision: 'approve',
      comment: body.comment ?? null,
      actorId: actor.userId,
      requestId: actor.requestId,
      imageDecisions: body.image_decisions?.map((item) => ({
        imageId: item.image_id,
        decision: item.decision,
      })),
      censoredFiles: Object.keys(censoredFiles).length > 0 ? censoredFiles : undefined,
    });
    return decisionResponse(c, outcome);
  }

  async reject(c: Context, id: string, body: { comment: string }) {
    const actor = this.requireActor(c);
    const outcome = await this.deps.review.execute({
      contributionId: id,
      decision: 'reject',
      comment: body.comment,
      actorId: actor.userId,
      requestId: actor.requestId,
    });
    return decisionResponse(c, outcome);
  }

  async correct(c: Context, id: string, body: CorrectContributionBody) {
    const actor = this.requireActor(c);
    const comment = body.comment ?? null;
    const publish = body.publish ?? true;

    if (body.entity_type === 'word') {
      const { entity_type: _type, comment: _comment, publish: _publish, ...wordBody } = body;
      const outcome = await this.deps.correct.execute({
        contributionId: id,
        actorId: actor.userId,
        requestId: actor.requestId,
        comment,
        publish,
        input: { word: toCreateWordDto({ ...wordBody, status: 'published' }, this.deps.imageProviderName) },
      });
      return decisionResponse(c, outcome, true);
    }

    if (body.entity_type === 'pronunciation') {
      const outcome = await this.deps.correct.execute({
        contributionId: id,
        actorId: actor.userId,
        requestId: actor.requestId,
        comment,
        publish,
        input: {
          pronunciation: {
            notation: body.notation,
            value: body.value,
            dialectId: body.dialect_id ?? null,
            audioUrl: body.audio_url ?? null,
            speakerName: body.speaker_name ?? null,
            notes: body.notes ?? null,
          },
        },
      });
      return decisionResponse(c, outcome, true);
    }

    if (body.entity_type === 'word_image') {
      const outcome = await this.deps.correct.execute({
        contributionId: id,
        actorId: actor.userId,
        requestId: actor.requestId,
        comment,
        publish,
        input: {
          wordImage: {
            url: body.url,
            providerFileId: body.provider_file_id,
            altText: body.alt_text ?? null,
            isPrimary: body.is_primary,
          },
        },
      });
      return decisionResponse(c, outcome, true);
    }

    if (body.entity_type === 'word_audio') {
      const outcome = await this.deps.correct.execute({
        contributionId: id,
        actorId: actor.userId,
        requestId: actor.requestId,
        comment,
        publish,
        input: {
          wordAudio: {
            speakerName: body.speaker_name ?? null,
            dialectId: body.dialect_id ?? null,
            isPrimary: body.is_primary,
          },
        },
      });
      return decisionResponse(c, outcome, true);
    }

    const outcome = await this.deps.correct.execute({
      contributionId: id,
      actorId: actor.userId,
      requestId: actor.requestId,
      comment,
      publish,
      input: {
        example: {
          sourceSentence: body.source_sentence,
          targetSentence: body.target_sentence ?? null,
          sourceType: body.source_type ?? null,
          notes: body.notes ?? null,
        },
      },
    });
    return decisionResponse(c, outcome, true);
  }

  private requireActor(c: Context) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    return { userId: actor.user_id, role: actor.role, requestId };
  }
}

function decisionResponse(
  c: Context,
  outcome: {
    contributionId: string;
    entityType: string;
    entityId: string;
    status: string;
    mergedIntoWordId?: string | null;
  },
  isCorrected = false,
) {
  return c.json({
    success: true as const,
    data: {
      contribution_id: outcome.contributionId,
      entity_type: outcome.entityType,
      entity_id: outcome.entityId,
      status: outcome.status,
      ...(isCorrected ? { is_corrected: true } : {}),
      ...(outcome.mergedIntoWordId
        ? { merged_into_word_id: outcome.mergedIntoWordId }
        : {}),
    },
  });
}

// Entity word punya Date fields → JSON; entity anak sudah snake_case plain
function serializeEntity(entity: unknown): unknown {
  if (entity === null || typeof entity !== 'object') return entity;
  return JSON.parse(
    JSON.stringify(entity, (_key, value) => (value instanceof Date ? value.toISOString() : value)),
  );
}
