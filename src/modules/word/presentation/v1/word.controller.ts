import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError, BadRequestError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { CreateWordUseCase } from '../../application/use-cases/create-word.use-case';
import type { UpdateWordUseCase } from '../../application/use-cases/update-word.use-case';
import type { GetWordByIdUseCase } from '../../application/use-cases/get-word-by-id.use-case';
import type { GetWordByLemmaUseCase } from '../../application/use-cases/get-word-by-lemma.use-case';
import type { GetWordOfDayUseCase } from '../../application/use-cases/get-word-of-day.use-case';
import type { SearchWordsUseCase } from '../../application/use-cases/search-words.use-case';
import type { VerifyWordUseCase } from '../../application/use-cases/verify-word.use-case';
import type { PublishWordUseCase } from '../../application/use-cases/publish-word.use-case';
import type { SoftDeleteWordUseCase } from '../../application/use-cases/soft-delete-word.use-case';
import type { BulkWordsActionUseCase } from '../../application/use-cases/bulk-words-action.use-case';
import type { TakedownWordUseCase } from '../../application/use-cases/takedown-word.use-case';
import type { RestoreWordUseCase } from '../../application/use-cases/restore-word.use-case';
import type { AddPronunciationUseCase } from '../../application/use-cases/add-pronunciation.use-case';
import type { AddWordImageUseCase } from '../../application/use-cases/add-word-image.use-case';
import type { AddExampleUseCase } from '../../application/use-cases/add-example.use-case';
import type { AddMeaningUseCase } from '../../application/use-cases/add-meaning.use-case';
import type { ImportWordsUseCase } from '../../application/use-cases/import-words.use-case';
import type {
  GetWordImportSessionUseCase,
  ListWordImportSessionsUseCase,
  SaveWordImportSessionUseCase,
} from '../../application/use-cases/word-import-session.use-cases';
import type { UploadPronunciationAudioUseCase } from '../../application/use-cases/upload-pronunciation-audio.use-case';
import type { DeletePronunciationAudioUseCase } from '../../application/use-cases/delete-pronunciation-audio.use-case';
import type {
  CreateWordBody,
  SearchWordsQueryBody,
  AdminListWordsQueryBody,
  ListWordsQueryBody,
  ListLatestWordsQueryBody,
} from './validators/create-word.validator';
import type { ImportWordsBody } from './validators/import-words.validator';
import type {
  ListImportSessionsQuery,
  SaveImportSessionBody,
} from './validators/import-session.validator';
import type { BulkWordsBody } from './validators/bulk-words.validator';
import type { UpdateWordBody } from './validators/update-word.validator';
import type { TakedownWordBody } from '@/modules/word-report/presentation/v1/validators/word-report.validator';
import type {
  AddExampleBody,
  AddMeaningBody,
  AddPronunciationBody,
  AddWordImageBody,
} from './validators/word-media.validator';
import { toCreateWordDto, toUpdateWordDto } from './map-create-word';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { LatestWordSummary, WordClassSummary, WordDetail } from '../../domain/entities/word.entity';
import { mapPublicWordImageUrl } from './map-word-image-url';
import type { ListAdminWordsUseCase } from '../../application/use-cases/list-admin-words.use-case';
import type { ListWordsUseCase } from '../../application/use-cases/list-words.use-case';
import type { ListLatestWordsUseCase } from '../../application/use-cases/list-latest-words.use-case';
import type { ListDuplicateWordsUseCase } from '../../application/use-cases/list-duplicate-words.use-case';
import {
  pickDefaultKeepWordId,
} from '../../application/use-cases/list-duplicate-words.use-case';
import type { MergeDuplicateWordsUseCase } from '../../application/use-cases/merge-duplicate-words.use-case';
import type { ListCommaSplitsUseCase } from '../../application/use-cases/list-comma-splits.use-case';
import type { ApplyCommaSplitUseCase } from '../../application/use-cases/apply-comma-split.use-case';
import type { MarkCommaLiteralUseCase } from '../../application/use-cases/mark-comma-literal.use-case';
import { MAX_AUDIO_BYTES } from '../../application/utils/validate-audio-file';
import type {
  ApplyCommaSplitBody,
  MarkCommaLiteralBody,
  MergeDuplicateWordsBody,
} from './validators/create-word.validator';

export class WordController {
  constructor(
    private readonly deps: {
      create: CreateWordUseCase;
      update: UpdateWordUseCase;
      getById: GetWordByIdUseCase;
      getByLemma: GetWordByLemmaUseCase;
      wordOfDay: GetWordOfDayUseCase;
      search: SearchWordsUseCase;
      listAdmin: ListAdminWordsUseCase;
      list: ListWordsUseCase;
      listLatest: ListLatestWordsUseCase;
      listDuplicates: ListDuplicateWordsUseCase;
      mergeDuplicates: MergeDuplicateWordsUseCase;
      listCommaSplits: ListCommaSplitsUseCase;
      applyCommaSplit: ApplyCommaSplitUseCase;
      markCommaLiteral: MarkCommaLiteralUseCase;
      verify: VerifyWordUseCase;
      publish: PublishWordUseCase;
      deleteWord: SoftDeleteWordUseCase;
      bulkWords: BulkWordsActionUseCase;
      takedownWord: TakedownWordUseCase;
      restoreWord: RestoreWordUseCase;
      addPronunciation: AddPronunciationUseCase;
      addWordImage: AddWordImageUseCase;
      addExample: AddExampleUseCase;
      addMeaning: AddMeaningUseCase;
      importWords: ImportWordsUseCase;
      saveImportSession: SaveWordImportSessionUseCase;
      listImportSessions: ListWordImportSessionsUseCase;
      getImportSession: GetWordImportSessionUseCase;
      uploadPronunciationAudio: UploadPronunciationAudioUseCase;
      deletePronunciationAudio: DeletePronunciationAudioUseCase;
      listWordClasses: () => Promise<WordClassSummary[]>;
      /** provider gambar aktif - dari composition root, bukan hardcode */
      imageProviderName: string;
    },
  ) {}

  async create(c: Context, body: CreateWordBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const { word, warnings, inlineCreatedWords, inlineWarnings, searchMissId } = await this.deps.create.execute(
      toCreateWordDto(body, this.deps.imageProviderName),
      { userId: actor.user_id, role: actor.role, requestId },
    );

    // Event bisnis + request_id menyambung log & jejak audit (Section 14)
    logger.info(
      {
        request_id: requestId,
        word_id: word.id,
        lemma: word.lemma,
        status: word.status,
        inline_created_count: inlineCreatedWords.length,
      },
      'word created',
    );

    return c.json(
      {
        success: true as const,
        data: {
          word_id: word.id,
          lemma: word.lemma,
          word_type: word.wordType,
          status: word.status,
          is_verified: word.isVerified,
          created_at: word.createdAt.toISOString(),
          search_miss_id: searchMissId,
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(inlineCreatedWords.length > 0
            ? {
                inline_created_words: inlineCreatedWords.map((inline, i) => ({
                  word_id: inline.id,
                  lemma: inline.lemma,
                  relation_type: inline.relationType,
                  word_type: inline.wordType,
                  status: inline.status,
                  is_verified: inline.isVerified,
                  meanings_count: inline.meaningsCount,
                  inherited_meanings_count: inline.inheritedMeaningsCount,
                  overridden_meanings_count: inline.overriddenMeaningsCount,
                  ...(inlineWarnings[i].length > 0 ? { warnings: inlineWarnings[i] } : {}),
                })),
              }
            : {}),
        },
      },
      201,
    );
  }

  async importWords(c: Context, body: ImportWordsBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const result = await this.deps.importWords.execute(body, {
      userId: actor.user_id,
      role: actor.role,
      requestId,
    });
    return c.json({ success: true as const, data: result }, body.mode === 'commit' ? 201 : 200);
  }

  async saveImportSession(c: Context, body: SaveImportSessionBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const session = await this.deps.saveImportSession.execute({
      id: body.id,
      triggeredBy: actor.user_id,
      sourceLabel: body.source_label,
      status: body.status,
      total: body.total,
      createdCount: body.created_count,
      duplicatesCount: body.duplicates_count,
      meaningsAddedCount: body.meanings_added_count,
      invalidCount: body.invalid_count,
      items: body.items,
    });
    return c.json({ success: true as const, data: this.toImportSessionData(session) }, 201);
  }

  async listImportSessions(c: Context, query: ListImportSessionsQuery) {
    const limit = query.limit ?? 20;
    const page = await this.deps.listImportSessions.execute({
      limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map((session) => this.toImportSessionData(session)),
      meta: {
        limit,
        next_cursor: page.nextCursor,
        has_more: page.hasMore,
      },
    });
  }

  async getImportSession(c: Context, id: string) {
    const session = await this.deps.getImportSession.execute(id);
    return c.json({ success: true as const, data: this.toImportSessionData(session) });
  }

  private toImportSessionData(session: {
    id: string;
    triggeredBy: string;
    triggeredByUsername: string | null;
    attributedTo: string;
    attributedToUsername: string | null;
    sourceLabel: string | null;
    status: 'completed' | 'cancelled' | 'failed';
    total: number;
    createdCount: number;
    duplicatesCount: number;
    meaningsAddedCount: number;
    invalidCount: number;
    items: { lemma: string; outcome: 'created' | 'meanings_added' | 'skipped' | 'invalid'; meanings_added: number; message?: string }[];
    createdAt: Date;
    finishedAt: Date | null;
  }) {
    return {
      id: session.id,
      triggered_by: session.triggeredBy,
      triggered_by_username: session.triggeredByUsername,
      attributed_to: session.attributedTo,
      attributed_to_username: session.attributedToUsername,
      source_label: session.sourceLabel,
      status: session.status,
      total: session.total,
      created_count: session.createdCount,
      duplicates_count: session.duplicatesCount,
      meanings_added_count: session.meaningsAddedCount,
      invalid_count: session.invalidCount,
      items: session.items,
      created_at: session.createdAt.toISOString(),
      finished_at: session.finishedAt?.toISOString() ?? null,
    };
  }

  async detail(c: Context, id: string) {
    const word = await this.deps.getById.execute(id);
    return c.json({ success: true as const, data: this.toDetailData(word, { redactStagingImages: true }) });
  }

  /** URL publik /words/<lemma> - resolusi homonim di repository. */
  async detailByLemma(c: Context, lemma: string) {
    const word = await this.deps.getByLemma.execute(lemma);
    return c.json({ success: true as const, data: this.toDetailData(word, { redactStagingImages: true }) });
  }

  /** 28-api-word-of-the-day.md - payload detail + date + is_new_this_week,
   *  atau data:null saat korpus published kosong (state normal). */
  async wordOfDay(c: Context) {
    const { date, isNewThisWeek, word } = await this.deps.wordOfDay.execute();
    return c.json({
      success: true as const,
      data: word
        ? {
            ...this.toDetailData(word, { redactStagingImages: true }),
            date,
            is_new_this_week: isNewThisWeek,
          }
        : null,
    });
  }

  /**
   * Detail kata SEMUA status - prefill form edit admin (05-api-edit-kata.md).
   * Endpoint publik detail tetap published-only; ini satu-satunya jalan
   * membuka draft/pending_review/rejected untuk diedit.
   */
  async adminDetail(c: Context, id: string) {
    const word = await this.deps.getById.execute(id, { includeAllStatuses: true });
    return c.json({
      success: true as const,
      data: {
        ...this.toDetailData(word, { redactStagingImages: false }),
        created_at: word.createdAt.toISOString(),
        updated_at: word.updatedAt ? word.updatedAt.toISOString() : null,
        takedown_reason_code: word.takedownReasonCode,
        takedown_note: word.takedownNote,
        taken_down_at: word.takenDownAt ? word.takenDownAt.toISOString() : null,
      },
    });
  }

  /** Edit kata - PUT full replace (05-api-edit-kata.md) */
  async update(c: Context, id: string, body: UpdateWordBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const { word, warnings } = await this.deps.update.execute(
      id,
      toUpdateWordDto(body, this.deps.imageProviderName),
      { userId: actor.user_id, role: actor.role, requestId },
    );

    logger.info(
      { request_id: requestId, word_id: word.id, lemma: word.lemma, status: word.status },
      'word updated',
    );

    return c.json({
      success: true as const,
      data: {
        word_id: word.id,
        lemma: word.lemma,
        word_type: word.wordType,
        status: word.status,
        is_verified: word.isVerified,
        is_corrected: word.isCorrected,
        updated_at: word.updatedAt ? word.updatedAt.toISOString() : null,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    });
  }

  // Mapping WordDetail → response - dipakai bersama detail publik & admin.
  // redactStagingImages: GET publik menyembunyikan URL ImageKit belum diverifikasi.
  private toDetailData(word: WordDetail, opts: { redactStagingImages: boolean }) {
    return {
      id: word.id,
      lemma: word.lemma,
      lemma_allows_comma: word.lemmaAllowsComma,
      language_id: word.languageId,
      notes: word.notes,
      word_type: word.wordType,
      usage_labels: word.usageLabels,
      status: word.status,
      is_verified: word.isVerified,
      is_corrected: word.isCorrected,
      self_verified: Boolean(
        word.isVerified && word.createdBy && word.verifiedBy && word.createdBy === word.verifiedBy,
      ),
      created_by: word.creator,
      verified_by: word.isVerified && word.verifier ? word.verifier : null,
      verified_at: word.isVerified && word.verifiedAt ? word.verifiedAt.toISOString() : null,
      meanings: word.meanings.map((m) => ({
        id: m.id,
        word_class: m.wordClass
          ? {
              id: m.wordClass.id,
              code: m.wordClass.code,
              name: m.wordClass.name,
              alias: m.wordClass.alias,
              description: m.wordClass.description,
              parent_id: m.wordClass.parentId,
            }
          : null,
        inherited_from_meaning_id: m.inheritedFromMeaningId,
        definition: m.definition,
        // 17: false = placeholder "-" - client menurunkan CTA "Bantu definisi"
        is_have_definition: m.isHaveDefinition,
        is_have_translation: m.isHaveTranslation,
        order_index: m.orderIndex,
        translations: m.translations.map((t) => ({
          language_id: t.languageId,
          translation_text: t.translationText,
          translation_type: t.translationType,
          translation_allows_comma: t.translationAllowsComma ?? false,
        })),
        examples: m.examples.map((e) => ({
          id: e.id,
          source_language_id: e.sourceLanguageId,
          source_sentence: e.sourceSentence,
          target_language_id: e.targetLanguageId,
          target_sentence: e.targetSentence,
          source_type: e.sourceType,
          audios: (e.audios ?? []).map((a) => ({
            id: a.id,
            url: a.url,
            dialect_id: a.dialectId,
            speaker_name: a.speakerName,
            duration_ms: a.durationMs,
            is_primary: a.isPrimary,
            mime_type: a.mimeType,
          })),
        })),
      })),
      categories: word.categories,
      pronunciations: word.pronunciations.map((p) => ({
        id: p.id,
        notation: p.notation,
        value: p.value,
        dialect_id: p.dialectId,
      })),
      images: word.images.map((img) => {
        const mapped = mapPublicWordImageUrl(
          {
            url: img.url,
            provider: img.provider,
            isVerified: img.isVerified,
            providerFileId: img.providerFileId,
          },
          { redactStaging: opts.redactStagingImages },
        );
        return {
          id: img.id,
          url: mapped.url,
          // WAJIB untuk round-trip PUT edit (full-replace): tanpa ini form
          // edit tidak bisa mengirim ulang images[] → gambar terhapus senyap
          provider_file_id: mapped.providerFileId,
          sha: opts.redactStagingImages && img.provider === 'imagekit' && img.isVerified !== true
            ? null
            : img.sha,
          alt_text: img.altText,
          is_primary: img.isPrimary,
          content_warnings: img.contentWarnings ?? [],
          // Publik juga butuh is_verified agar klien blur/pending tanpa tebak placehold.co
          is_verified: img.isVerified ?? false,
          ...(opts.redactStagingImages
            ? {}
            : {
                provider: img.provider,
              }),
        };
      }),
      audios: word.audios.map((a) => ({
        id: a.id,
        url: a.url,
        dialect_id: a.dialectId,
        speaker_name: a.speakerName,
        duration_ms: a.durationMs,
        is_primary: a.isPrimary,
        mime_type: a.mimeType,
      })),
      related_words: word.relatedWords.map((rel) => ({
        word_id: rel.wordId,
        lemma: rel.lemma,
        relation_type: rel.relationType,
      })),
      appears_in: word.appearsIn.map((rel) => ({
        word_id: rel.wordId,
        lemma: rel.lemma,
        relation_type: rel.relationType,
      })),
      variants: word.variants.map((v) => ({
        id: v.id,
        form: v.form,
        variant_type: v.variantType,
        affix_type: v.affixType,
        affix_value: v.affixValue,
        dialect_id: v.dialectId,
        notes: v.notes,
      })),
    };
  }

  async search(c: Context, query: SearchWordsQueryBody) {
    const { items, meta } = await this.deps.search.execute({
      q: query.q,
      limit: query.limit,
      cursor: query.cursor,
      searchIn: query.search_in,
      translationLanguageId: query.translation_language_id,
      wordType: query.word_type,
      isVerified: query.is_verified,
    });
    return c.json({
      success: true as const,
      data: items.map(toListItem),
      meta,
    });
  }

  /** Panel admin Kata - filter tayang via tabs (published true|false|all) */
  async listAdmin(c: Context, query: AdminListWordsQueryBody) {
    const { items, meta } = await this.deps.listAdmin.execute({
      q: query.q,
      limit: query.limit,
      cursor: query.cursor,
      wordType: query.word_type,
      isVerified: query.is_verified,
      published: query.published,
    });
    return c.json({
      success: true as const,
      data: items.map(toListItem),
      meta,
    });
  }

  /** 18-api-list-words.md - browsing A-Z publik (tanpa search-miss) */
  async list(c: Context, query: ListWordsQueryBody) {
    const { items, meta } = await this.deps.list.execute({
      q: query.q,
      limit: query.limit,
      cursor: query.cursor,
      wordType: query.word_type,
    });
    return c.json({
      success: true as const,
      data: items.map(toListItem),
      meta,
    });
  }

  /** Feed beranda - published, urut waktu persetujuan. */
  async listLatest(c: Context, query: ListLatestWordsQueryBody) {
    const { items, meta } = await this.deps.listLatest.execute({
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: items.map(toLatestItem),
      meta,
    });
  }

  async verify(c: Context, id: string, verified: boolean) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    await this.deps.verify.execute({
      wordId: id,
      verified,
      actorId: actor.user_id,
      requestId,
    });
    return c.json({ success: true as const, data: null });
  }

  async publish(c: Context, id: string, published: boolean) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const result = await this.deps.publish.execute({
      wordId: id,
      published,
      actorId: actor.user_id,
      requestId,
    });
    return c.json({
      success: true as const,
      data: {
        word_id: result.wordId,
        merged_into_word_id: result.mergedIntoWordId,
      },
    });
  }

  async listDuplicates(c: Context) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');

    const { groups, totalGroups } = await this.deps.listDuplicates.execute();
    return c.json({
      success: true as const,
      data: {
        total_groups: totalGroups,
        groups: groups.map((g) => {
          const defaultKeep = pickDefaultKeepWordId(g.items);
          return {
            lemma: g.lemma,
            language_id: g.languageId,
            language_code: g.languageCode,
            default_keep_word_id: defaultKeep,
            items: g.items.map((item) => ({
              id: item.id,
              lemma: item.lemma,
              language_id: item.languageId,
              language_code: item.languageCode,
              word_type: item.wordType,
              status: item.status,
              is_verified: item.isVerified,
              meanings_count: item.meaningsCount,
              created_at: item.createdAt.toISOString(),
              suggested_keep: item.id === defaultKeep,
            })),
          };
        }),
      },
    });
  }

  async mergeDuplicates(c: Context, body: MergeDuplicateWordsBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const result = await this.deps.mergeDuplicates.execute({
      keepWordId: body.keep_word_id,
      mergeWordIds: body.merge_word_ids,
      actorId: actor.user_id,
      requestId,
    });
    return c.json({
      success: true as const,
      data: {
        keep_word_id: result.keepWordId,
        merged_word_ids: result.mergedWordIds,
      },
    });
  }

  async listCommaSplits(c: Context) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');

    const result = await this.deps.listCommaSplits.execute();
    return c.json({
      success: true as const,
      data: {
        total: result.total,
        lemmas: result.lemmas.map((item) => ({
          word_id: item.wordId,
          lemma: item.lemma,
          language_id: item.languageId,
          language_code: item.languageCode,
          word_type: item.wordType,
          status: item.status,
          is_verified: item.isVerified,
          meanings_count: item.meaningsCount,
          suggested_parts: item.suggestedParts,
          meaning_preview: item.meaningPreview,
          copied_translation: item.copiedTranslation,
          copied_definition: item.copiedDefinition,
        })),
        translations: result.translations.map((item) => ({
          meaning_translation_id: item.meaningTranslationId,
          meaning_id: item.meaningId,
          word_id: item.wordId,
          lemma: item.lemma,
          translation_text: item.translationText,
          language_id: item.languageId,
          language_code: item.languageCode,
          suggested_parts: item.suggestedParts,
          definition: item.definition,
          word_class_id: item.wordClassId,
        })),
      },
    });
  }

  async applyCommaSplit(c: Context, body: ApplyCommaSplitBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const result =
      body.kind === 'lemma'
        ? await this.deps.applyCommaSplit.execute({
            kind: 'lemma',
            wordId: body.word_id,
            parts: body.parts,
            meaningOverrides: body.meaning_overrides?.map((item) =>
              item.mode === 'copy'
                ? { mode: 'copy' as const }
                : {
                    mode: 'replace' as const,
                    translationText: item.translation_text,
                    definition: item.definition?.trim() ? item.definition.trim() : null,
                    wordClassId: item.word_class_id ?? null,
                    meaningSource: item.meaning_source,
                  },
            ),
            actorId: actor.user_id,
            requestId,
          })
        : await this.deps.applyCommaSplit.execute({
            kind: 'translation',
            meaningTranslationId: body.meaning_translation_id,
            parts: body.parts,
            actorId: actor.user_id,
            requestId,
          });

    return c.json({
      success: true as const,
      data: {
        kind: result.kind,
        word_id: result.wordId,
        ...(result.createdWordIds ? { created_word_ids: result.createdWordIds } : {}),
        ...(result.meaningIds ? { meaning_ids: result.meaningIds } : {}),
      },
    });
  }

  async markCommaLiteral(c: Context, body: MarkCommaLiteralBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const result =
      body.kind === 'lemma'
        ? await this.deps.markCommaLiteral.execute({
            kind: 'lemma',
            wordId: body.word_id,
            actorId: actor.user_id,
            requestId,
          })
        : await this.deps.markCommaLiteral.execute({
            kind: 'translation',
            meaningTranslationId: body.meaning_translation_id,
            actorId: actor.user_id,
            requestId,
          });

    return c.json({
      success: true as const,
      data: {
        kind: result.kind,
        id: result.id,
      },
    });
  }

  /**
   * Submit kata via endpoint publik /api/v1/contributions/words.
   * - Tanpa Bearer → user sistem Anonim (legacy anonim).
   * - Dengan Bearer valid (optionalAuth) → atribusi ke user login
   *   (role dari JWT). Status tetap dipaksa 'published' (= kirim review);
   *   contributor/role non-verifier → pending_review via resolvePublication.
   */
  async createAnon(c: Context, body: Omit<CreateWordBody, 'status'>) {
    const ctx = c as Context<{ Variables: AppVariables }>;
    const requestId = ctx.get('requestId');
    const authUser = ctx.get('user');
    const actor = authUser
      ? { userId: authUser.user_id, role: authUser.role, requestId }
      : { userId: ANONIM_USER_ID, role: 'contributor' as const, requestId };

    const { word, warnings, inlineCreatedWords, inlineWarnings, searchMissId } = await this.deps.create.execute(
      toCreateWordDto({ ...body, status: 'published' }, this.deps.imageProviderName),
      actor,
    );

    return c.json(
      {
        success: true as const,
        data: {
          word_id: word.id,
          lemma: word.lemma,
          word_type: word.wordType,
          status: word.status,
          is_verified: word.isVerified,
          created_at: word.createdAt.toISOString(),
          search_miss_id: searchMissId,
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(inlineCreatedWords.length > 0
            ? {
                inline_created_words: inlineCreatedWords.map((inline, i) => ({
                  word_id: inline.id,
                  lemma: inline.lemma,
                  relation_type: inline.relationType,
                  word_type: inline.wordType,
                  status: inline.status,
                  is_verified: inline.isVerified,
                  meanings_count: inline.meaningsCount,
                  inherited_meanings_count: inline.inheritedMeaningsCount,
                  overridden_meanings_count: inline.overriddenMeaningsCount,
                  ...(inlineWarnings[i].length > 0 ? { warnings: inlineWarnings[i] } : {}),
                })),
              }
            : {}),
        },
      },
      201,
    );
  }

  async addPronunciation(c: Context, wordId: string, body: AddPronunciationBody) {
    const media = await this.withActor(c, (actor) =>
      this.deps.addPronunciation.execute(
        wordId,
        {
          dialectId: body.dialect_id,
          notation: body.notation,
          value: body.value,
          audioUrl: body.audio_url,
          speakerName: body.speaker_name,
          notes: body.notes,
        },
        actor,
      ),
    );
    return c.json(
      {
        success: true as const,
        data: {
          id: media.id,
          word_id: media.wordId,
          dialect_id: media.dialectId,
          notation: media.notation,
          value: media.value,
          audio_url: media.audioUrl,
          speaker_name: media.speakerName,
          notes: media.notes,
          status: media.status,
          is_verified: media.isVerified,
          is_corrected: media.isCorrected,
        },
      },
      201,
    );
  }

  async addWordImage(c: Context, wordId: string, body: AddWordImageBody) {
    const media = await this.withActor(c, (actor) =>
      this.deps.addWordImage.execute(
        wordId,
        {
          url: body.url,
          provider: body.provider,
          providerFileId: body.provider_file_id,
          sha: body.sha ?? null,
          altText: body.alt_text,
          isPrimary: body.is_primary,
          contentWarnings: body.content_warnings ?? [],
        },
        actor,
      ),
    );
    return c.json(
      {
        success: true as const,
        data: {
          id: media.id,
          word_id: media.wordId,
          url: media.url,
          provider_file_id: media.providerFileId,
          alt_text: media.altText,
          is_primary: media.isPrimary,
          content_warnings: media.contentWarnings,
          status: media.status,
          is_verified: media.isVerified,
          is_corrected: media.isCorrected,
        },
      },
      201,
    );
  }

  async uploadPronunciationAudio(c: Context, wordId: string) {
    const contentLength = Number(c.req.header('content-length') ?? 0);
    // bodyLimit middleware menangani hard cap; cek cepat sebelum parse
    if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) {
      throw new BadRequestError('AUDIO_TOO_LARGE', 'File audio terlalu besar (maks 5 MB)', [
        { field: 'audio', message: 'Ukuran maksimal 5 MB' },
      ]);
    }

    const body = await c.req.parseBody({ all: true });
    const audioPart = body['audio'];
    if (!audioPart || typeof audioPart === 'string') {
      throw new BadRequestError('VALIDATION_ERROR', 'File audio wajib diunggah', [
        { field: 'audio', message: 'Field multipart `audio` wajib berisi file' },
      ]);
    }

    const file = audioPart as File;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const media = await this.withActor(c, (actor) =>
      this.deps.uploadPronunciationAudio.execute(
        wordId,
        {
          bytes,
          mimeType: file.type || null,
          filename: file.name || null,
          dialectId: strField(body['dialect_id']),
          exampleId: strField(body['example_id']),
          speakerName: strField(body['speaker_name']),
          durationMs: body['duration_ms'],
        },
        actor,
      ),
    );

    return c.json(
      {
        success: true as const,
        data: {
          id: media.id,
          word_id: media.wordId,
          example_id: media.exampleId,
          dialect_id: media.dialectId,
          url: media.url,
          mime_type: media.mimeType,
          file_size: media.fileSize,
          duration_ms: media.durationMs,
          speaker_name: media.speakerName,
          is_primary: media.isPrimary,
          status: media.status,
          is_verified: media.isVerified,
          is_corrected: media.isCorrected,
        },
      },
      201,
    );
  }

  async deletePronunciationAudio(c: Context, wordId: string, audioId: string) {
    await this.withActor(c, (actor) =>
      this.deps.deletePronunciationAudio.execute(wordId, audioId, actor),
    );
    return c.body(null, 204);
  }

  async addExample(c: Context, meaningId: string, body: AddExampleBody) {
    const media = await this.withActor(c, (actor) =>
      this.deps.addExample.execute(
        meaningId,
        {
          sourceLanguageId: body.source_language_id,
          sourceSentence: body.source_sentence,
          targetLanguageId: body.target_language_id,
          targetSentence: body.target_sentence,
          sourceType: body.source_type,
          notes: body.notes,
        },
        actor,
      ),
    );
    return c.json(
      {
        success: true as const,
        data: {
          id: media.id,
          meaning_id: media.meaningId,
          source_language_id: media.sourceLanguageId,
          source_sentence: media.sourceSentence,
          target_language_id: media.targetLanguageId,
          target_sentence: media.targetSentence,
          source_type: media.sourceType,
          notes: media.notes,
          status: media.status,
          is_verified: media.isVerified,
          is_corrected: media.isCorrected,
        },
      },
      201,
    );
  }

  /** POST /api/v1/words/:wordId/meanings - kontribusi definisi (17-api) */
  async addMeaning(c: Context, wordId: string, body: AddMeaningBody) {
    const media = await this.withActor(c, (actor) =>
      this.deps.addMeaning.execute(
        wordId,
        {
          wordClassId: body.word_class_id,
          definition: body.definition,
          translations: body.translations.map((t) => ({
            languageId: t.language_id,
            translationText: t.translation_text,
            translationType: t.translation_type,
          })),
        },
        actor,
      ),
    );
    return c.json(
      {
        success: true as const,
        data: {
          id: media.id,
          word_id: media.wordId,
          word_class_id: media.wordClassId,
          definition: media.definition,
          order_index: media.orderIndex,
          status: media.status,
          is_verified: media.isVerified,
          is_corrected: media.isCorrected,
        },
      },
      201,
    );
  }

  async takedownWord(c: Context, id: string, body: TakedownWordBody) {
    return this.withActor(c, async (actor) => {
      await this.deps.takedownWord.execute({
        wordId: id,
        actorId: actor.userId,
        reasonCode: body.reason_code,
        note: body.note,
        requestId: actor.requestId,
      });
      return c.json({ success: true as const, data: { id, status: 'taken_down' as const } });
    });
  }

  async restoreWord(c: Context, id: string) {
    return this.withActor(c, async (actor) => {
      await this.deps.restoreWord.execute({
        wordId: id,
        actorId: actor.userId,
        requestId: actor.requestId,
      });
      return c.json({ success: true as const, data: { id, status: 'published' as const } });
    });
  }

  /** Soft-delete kata - DELETE /api/v1/admin/words/:id (07-api-delete-kata.md) */
  async deleteWord(c: Context, id: string) {
    return this.withActor(c, async (actor) => {
      await this.deps.deleteWord.execute({ wordId: id, actorId: actor.userId, requestId: actor.requestId });

      logger.info({ request_id: actor.requestId, word_id: id }, 'word soft-deleted');

      return c.json({ success: true as const, data: null });
    });
  }

  /** Mass-action kata - POST /api/v1/admin/words/bulk (delete | publish | unpublish) */
  async bulkWords(c: Context, body: BulkWordsBody) {
    return this.withActor(c, async (actor) => {
      const data = await this.deps.bulkWords.execute({
        action: body.action,
        ids: body.ids,
        actorId: actor.userId,
        actorRole: actor.role,
        requestId: actor.requestId,
      });

      logger.info(
        {
          request_id: actor.requestId,
          action: data.action,
          succeeded: data.succeeded,
          failed: data.failed,
        },
        'words bulk action',
      );

      return c.json({ success: true as const, data });
    });
  }

  /** Ambil user + requestId dari context, lempar 401 kalau tidak ada token */
  private async withActor<T>(
    c: Context,
    fn: (actor: { userId: string; role: string; requestId?: string | null }) => Promise<T>,
  ): Promise<T> {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    return fn({ userId: actor.user_id, role: actor.role, requestId });
  }

  async wordClasses(c: Context) {
    const items = await this.deps.listWordClasses();
    return c.json({
      success: true as const,
      data: items.map((wc) => ({
        id: wc.id,
        code: wc.code,
        name: wc.name,
        alias: wc.alias,
        description: wc.description,
        parent_id: wc.parentId,
      })),
    });
  }
}

function toListItem(w: {
  id: string;
  lemma: string;
  languageId: string;
  languageCode: string;
  wordType: string;
  usageLabels?: string[];
  isVerified: boolean;
  status: string;
  matchedTranslation?: string;
  matchedVariant?: string;
  sense?: string | null;
}) {
  return {
    id: w.id,
    lemma: w.lemma,
    language_id: w.languageId,
    language_code: w.languageCode,
    word_type: w.wordType,
    usage_labels: w.usageLabels ?? [],
    is_verified: w.isVerified,
    status: w.status,
    ...(w.matchedTranslation !== undefined ? { matched_translation: w.matchedTranslation } : {}),
    ...(w.matchedVariant !== undefined ? { matched_variant: w.matchedVariant } : {}),
    // A-Z + search: `[n] makan,[v] santap`. Null = belum ada terjemahan published.
    ...(w.sense !== undefined ? { sense: w.sense } : {}),
  };
}

function toLatestItem(w: LatestWordSummary) {
  return {
    id: w.id,
    lemma: w.lemma,
    language_id: w.languageId,
    language_code: w.languageCode,
    word_type: w.wordType,
    usage_labels: w.usageLabels,
    is_verified: w.isVerified,
    status: w.status,
    approved_at: w.approvedAt.toISOString(),
    sense: w.sense,
  };
}

function strField(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
