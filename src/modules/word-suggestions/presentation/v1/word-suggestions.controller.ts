import type { Context } from 'hono';
import type { WordSuggestionRepositoryImpl } from '../../infrastructure/word-suggestion.repository.impl';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { CreateSuggestionRequest } from './validators/suggestion.validator';
import { assertCanContribute } from '@/modules/word/application/utils/assert-can-contribute';
import {
  mapProposedChanges,
  resolveReasonFields,
  createSuggestionResponseSchema,
  suggestionListResponseSchema,
  suggestionDetailResponseSchema,
  approveResponseSchema,
  rejectResponseSchema,
  changeHistoryResponseSchema,
} from './validators/suggestion.validator';

export interface WordSuggestionControllerDeps {
  repository: WordSuggestionRepositoryImpl;
  inbox?: RecordInboxNotificationUseCase;
}

export class WordSuggestionController {
  constructor(private deps: WordSuggestionControllerDeps) {}

  async createSuggestion(c: Context, body: CreateSuggestionRequest, userId: string, wordId: string) {
    await assertCanContribute(userId);
    const proposed = mapProposedChanges(body.proposed_changes);
    const { reasonCode, reasonDisplay } = resolveReasonFields(body);
    const suggestion = await this.deps.repository.createSuggestion(
      userId,
      wordId,
      proposed,
      reasonDisplay,
      reasonCode,
    );
    return c.json(
      createSuggestionResponseSchema.parse({
        success: true,
        data: {
          suggestion_id: suggestion.id,
          word_id: suggestion.wordId,
          word_lemma: suggestion.wordLemma ?? '',
          status: 'pending',
          created_at: suggestion.createdAt.toISOString(),
          message: 'Usul perubahan berhasil dikirim. Terima kasih!',
        },
      }),
      201,
    );
  }

  async listSuggestions(c: Context, limit: number, cursor?: string, status?: string) {
    const result = await this.deps.repository.listSuggestions({
      status: status as 'pending' | 'approved' | 'rejected' | 'corrected' | undefined,
      limit,
      cursor,
    });
    return c.json(
      suggestionListResponseSchema.parse({
        success: true,
        data: result.items.map((item) => ({
          id: item.id,
          word_id: item.wordId,
          word_lemma: item.wordLemma,
          contributor_id: item.contributorId,
          contributor_username: item.contributorUsername,
          reason: item.reason,
          reason_code: item.reasonCode,
          status: item.status,
          created_at: item.createdAt.toISOString(),
          summary_changes: {
            lemma: item.summaryChanges.lemma,
            notes: item.summaryChanges.notes,
            meanings_count: item.summaryChanges.meaningsCount,
            categories_added: item.summaryChanges.categoriesAdded,
            categories_removed: item.summaryChanges.categoriesRemoved,
            relations_count: item.summaryChanges.relationsCount,
            variants_count: item.summaryChanges.variantsCount,
            images_count: item.summaryChanges.imagesCount,
          },
        })),
        meta: {
          limit,
          next_cursor: result.nextCursor,
          has_more: result.hasMore,
        },
      }),
    );
  }

  async getSuggestionDetail(c: Context, id: string): Promise<Response> {
    const detail = await this.deps.repository.getSuggestionDetail(id);
    if (!detail) {
      return c.json(
        {
          success: false,
          error_code: 'SUGGESTION_NOT_FOUND',
          message: 'Usulan tidak ditemukan',
          details: null,
        },
        404,
      );
    }
    return c.json(
      suggestionDetailResponseSchema.parse({
        success: true,
        data: {
          suggestion: {
            id: detail.suggestion.id,
            word_id: detail.suggestion.wordId,
            word_lemma: detail.suggestion.wordLemma,
            contributor_id: detail.suggestion.userId,
            contributor_username: detail.suggestion.contributorUsername,
            reason: detail.suggestion.reason,
            reason_code: detail.suggestion.reasonCode,
            proposed_changes: detail.suggestion.proposedChanges,
            status: detail.suggestion.status,
            created_at: detail.suggestion.createdAt.toISOString(),
          },
          current_word: {
            lemma: detail.currentWord.lemma,
            notes: detail.currentWord.notes,
            meanings: detail.currentWord.meanings.map((m) => ({
              id: m.id,
              word_class: m.wordClass.code ? m.wordClass : null,
              definition: m.definition,
              translations: m.translations.map((t) => ({
                translation_text: t.translationText,
              })),
            })),
            category_ids: detail.currentWord.categoryIds,
            relations: detail.currentWord.relations.map((r) => ({
              relation_type: r.relationType,
              word_id: r.wordId,
              lemma: r.lemma,
            })),
            variants: detail.currentWord.variants.map((v) => ({
              form: v.form,
              variant_type: v.variantType,
              dialect_id: v.dialectId,
            })),
            images: detail.currentWord.images.map((i) => ({
              id: i.id,
              url: i.url,
              is_primary: i.isPrimary,
              alt_text: i.altText,
            })),
          },
          diff: {
            lemma: detail.diff.lemma,
            notes: detail.diff.notes,
            meanings: detail.diff.meanings.map((m) => ({
              meaning_id: m.meaningId,
              changes: m.changes,
            })),
            categories: detail.diff.categories,
            relations: {
              added: detail.diff.relations.added.map((r) => ({
                relation_type: r.relationType,
                word_id: r.wordId,
                lemma: r.lemma,
              })),
              removed: detail.diff.relations.removed.map((r) => ({
                relation_type: r.relationType,
                word_id: r.wordId,
                lemma: r.lemma,
              })),
            },
            variants: {
              added: detail.diff.variants.added.map((v) => ({
                form: v.form,
                variant_type: v.variantType,
              })),
              removed: detail.diff.variants.removed.map((v) => ({
                form: v.form,
                variant_type: v.variantType,
              })),
            },
            images: {
              added: detail.diff.images.added.map((i) => ({
                url: i.url,
                is_primary: i.isPrimary,
              })),
              removed: detail.diff.images.removed.map((i) => ({ image_id: i.imageId })),
              set_primary: detail.diff.images.setPrimary.map((i) => ({ image_id: i.imageId })),
            },
          },
        },
      }),
    );
  }

  async approveSuggestion(
    c: Context,
    id: string,
    userId: string,
    comment?: string,
  ): Promise<Response> {
    const existing = await this.deps.repository.findById(id);
    const result = await this.deps.repository.approveSuggestion(id, userId, comment);
    if (existing) {
      await this.deps.inbox?.execute({
        userId: existing.userId,
        type: 'suggestion_approved',
        targetKind: 'suggestion',
        targetId: id,
      });
    }
    return c.json(
      approveResponseSchema.parse({
        success: true,
        data: {
          suggestion_id: id,
          word_id: result.wordId,
          word_lemma: result.wordLemma,
          status: 'approved',
          changes_applied: result.changesApplied,
          message: 'Usulan telah disetujui dan diterapkan.',
        },
      }),
    );
  }

  async rejectSuggestion(
    c: Context,
    id: string,
    userId: string,
    comment: string,
  ): Promise<Response> {
    const existing = await this.deps.repository.findById(id);
    await this.deps.repository.rejectSuggestion(id, userId, comment);
    if (existing) {
      await this.deps.inbox?.execute({
        userId: existing.userId,
        type: 'suggestion_rejected',
        targetKind: 'suggestion',
        targetId: id,
      });
    }
    return c.json(
      rejectResponseSchema.parse({
        success: true,
        data: { suggestion_id: id, status: 'rejected' },
      }),
    );
  }

  async correctSuggestion(
    c: Context,
    id: string,
    userId: string,
    correctedChangesRaw: CreateSuggestionRequest['proposed_changes'],
    publish: boolean,
    comment?: string,
  ) {
    const existing = await this.deps.repository.findById(id);
    const corrected = mapProposedChanges(correctedChangesRaw);
    const result = await this.deps.repository.correctSuggestion(
      id,
      userId,
      corrected,
      publish,
      comment,
    );
    if (existing && result.status === 'corrected') {
      await this.deps.inbox?.execute({
        userId: existing.userId,
        type: 'suggestion_corrected',
        targetKind: 'suggestion',
        targetId: id,
      });
    }
    return c.json({
      success: true,
      data: {
        suggestion_id: id,
        status: result.status,
        applied: result.applied,
        changes_applied: result.changesApplied,
        word_lemma: result.wordLemma,
        message: result.applied
          ? 'Koreksi diterapkan dan usulan disetujui.'
          : 'Koreksi diterima, menunggu persetujuan lebih lanjut.',
      },
    });
  }

  async getChangeHistory(
    c: Context,
    wordId: string,
    limit: number,
    cursor?: string,
  ): Promise<Response> {
    const result = await this.deps.repository.getChangeHistory(wordId, limit, cursor);
    return c.json(
      changeHistoryResponseSchema.parse({
        success: true,
        data: result.items.map((item) => ({
          id: item.id,
          timestamp: item.timestamp.toISOString(),
          actor: {
            user_id: item.actorUserId,
            username: item.actorUsername,
          },
          type: item.type,
          changes: item.changes.map((ch) => ({
            entity: ch.entity,
            field: ch.field,
            old_value: ch.oldValue,
            new_value: ch.newValue,
            display_old: ch.displayOld,
            display_new: ch.displayNew,
          })),
          source: item.source
            ? {
                suggestion_id: item.source.suggestionId,
                suggested_by: {
                  user_id: item.source.suggestedByUserId,
                  username: item.source.suggestedByUsername,
                },
                reason: item.source.reason,
                reviewer: item.source.reviewerUserId
                  ? {
                      user_id: item.source.reviewerUserId,
                      username: item.source.reviewerUsername,
                    }
                  : null,
                review_comment: item.source.reviewComment,
              }
            : null,
        })),
        meta: {
          limit,
          next_cursor: result.nextCursor,
          has_more: result.hasMore,
        },
      }),
    );
  }
}
