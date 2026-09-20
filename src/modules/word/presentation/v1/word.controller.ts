import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { CreateWordUseCase } from '../../application/use-cases/create-word.use-case';
import type { UpdateWordUseCase } from '../../application/use-cases/update-word.use-case';
import type { GetWordByIdUseCase } from '../../application/use-cases/get-word-by-id.use-case';
import type { SearchWordsUseCase } from '../../application/use-cases/search-words.use-case';
import type { VerifyWordUseCase } from '../../application/use-cases/verify-word.use-case';
import type { PublishWordUseCase } from '../../application/use-cases/publish-word.use-case';
import type { SoftDeleteWordUseCase } from '../../application/use-cases/soft-delete-word.use-case';
import type { AddPronunciationUseCase } from '../../application/use-cases/add-pronunciation.use-case';
import type { AddWordImageUseCase } from '../../application/use-cases/add-word-image.use-case';
import type { AddExampleUseCase } from '../../application/use-cases/add-example.use-case';
import type { AddMeaningUseCase } from '../../application/use-cases/add-meaning.use-case';
import type {
  CreateWordBody,
  SearchWordsQueryBody,
  AdminListWordsQueryBody,
  ListWordsQueryBody,
} from './validators/create-word.validator';
import type { UpdateWordBody } from './validators/update-word.validator';
import type {
  AddExampleBody,
  AddMeaningBody,
  AddPronunciationBody,
  AddWordImageBody,
} from './validators/word-media.validator';
import { toCreateWordDto, toUpdateWordDto } from './map-create-word';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { WordClassSummary, WordDetail } from '../../domain/entities/word.entity';
import type { ListAdminWordsUseCase } from '../../application/use-cases/list-admin-words.use-case';
import type { ListWordsUseCase } from '../../application/use-cases/list-words.use-case';

export class WordController {
  constructor(
    private readonly deps: {
      create: CreateWordUseCase;
      update: UpdateWordUseCase;
      getById: GetWordByIdUseCase;
      search: SearchWordsUseCase;
      listAdmin: ListAdminWordsUseCase;
      list: ListWordsUseCase;
      verify: VerifyWordUseCase;
      publish: PublishWordUseCase;
      deleteWord: SoftDeleteWordUseCase;
      addPronunciation: AddPronunciationUseCase;
      addWordImage: AddWordImageUseCase;
      addExample: AddExampleUseCase;
      addMeaning: AddMeaningUseCase;
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

  async detail(c: Context, id: string) {
    const word = await this.deps.getById.execute(id);
    return c.json({ success: true as const, data: this.toDetailData(word) });
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
        ...this.toDetailData(word),
        created_at: word.createdAt.toISOString(),
        updated_at: word.updatedAt ? word.updatedAt.toISOString() : null,
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

  // Mapping WordDetail → response - dipakai bersama detail publik & admin
  private toDetailData(word: WordDetail) {
    return {
      id: word.id,
      lemma: word.lemma,
      language_id: word.languageId,
      notes: word.notes,
      word_type: word.wordType,
      status: word.status,
      is_verified: word.isVerified,
      is_corrected: word.isCorrected,
      verified_at: word.verifiedAt ? word.verifiedAt.toISOString() : null,
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
        })),
        examples: m.examples.map((e) => ({
          id: e.id,
          source_language_id: e.sourceLanguageId,
          source_sentence: e.sourceSentence,
          target_language_id: e.targetLanguageId,
          target_sentence: e.targetSentence,
          source_type: e.sourceType,
        })),
      })),
      categories: word.categories,
      pronunciations: word.pronunciations.map((p) => ({
        id: p.id,
        notation: p.notation,
        value: p.value,
        dialect_id: p.dialectId,
      })),
      images: word.images.map((img) => ({
        id: img.id,
        url: img.url,
        // WAJIB untuk round-trip PUT edit (full-replace): tanpa ini form
        // edit tidak bisa mengirim ulang images[] → gambar terhapus senyap
        provider_file_id: img.providerFileId,
        alt_text: img.altText,
        is_primary: img.isPrimary,
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

  /**
   * Submit kata oleh pengunjung ANONIM (tanpa login) - endpoint publik
   * /api/v1/contributions/words. Reuse use case create yang sama; actor
   * = user sistem Anonim (role contributor) sehingga otomatis masuk
   * antrean pending_review via resolvePublication. Status dipaksa
   * 'published' (= "kirim untuk direview") karena draft milik anonim
   * tidak bermakna (tidak bisa kembali melanjutkannya).
   */
  async createAnon(c: Context, body: Omit<CreateWordBody, 'status'>) {
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const { word, warnings, inlineCreatedWords, inlineWarnings, searchMissId } = await this.deps.create.execute(
      toCreateWordDto({ ...body, status: 'published' }, this.deps.imageProviderName),
      { userId: ANONIM_USER_ID, role: 'contributor', requestId },
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
          providerFileId: body.provider_file_id,
          altText: body.alt_text,
          isPrimary: body.is_primary,
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
          status: media.status,
          is_verified: media.isVerified,
          is_corrected: media.isCorrected,
        },
      },
      201,
    );
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

  /** Soft-delete kata - DELETE /api/v1/admin/words/:id (07-api-delete-kata.md) */
  async deleteWord(c: Context, id: string) {
    return this.withActor(c, async (actor) => {
      await this.deps.deleteWord.execute({ wordId: id, actorId: actor.userId, requestId: actor.requestId });

      logger.info({ request_id: actor.requestId, word_id: id }, 'word soft-deleted');

      return c.json({ success: true as const, data: null });
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
  isVerified: boolean;
  status: string;
  matchedTranslation?: string;
  matchedVariant?: string;
}) {
  return {
    id: w.id,
    lemma: w.lemma,
    language_id: w.languageId,
    language_code: w.languageCode,
    word_type: w.wordType,
    is_verified: w.isVerified,
    status: w.status,
    ...(w.matchedTranslation !== undefined ? { matched_translation: w.matchedTranslation } : {}),
    ...(w.matchedVariant !== undefined ? { matched_variant: w.matchedVariant } : {}),
  };
}
