import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { CreateWordUseCase } from '../../application/use-cases/create-word.use-case';
import type { GetWordByIdUseCase } from '../../application/use-cases/get-word-by-id.use-case';
import type { SearchWordsUseCase } from '../../application/use-cases/search-words.use-case';
import type { CreateWordBody, SearchWordsQueryBody } from './validators/create-word.validator';
import type { WordClassSummary } from '../../domain/entities/word.entity';

export class WordController {
  constructor(
    private readonly deps: {
      create: CreateWordUseCase;
      getById: GetWordByIdUseCase;
      search: SearchWordsUseCase;
      listWordClasses: () => Promise<WordClassSummary[]>;
      /** provider gambar aktif — dari composition root, bukan hardcode */
      imageProviderName: string;
    },
  ) {}

  async create(c: Context, body: CreateWordBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');

    const { word, warnings } = await this.deps.create.execute(
      {
        languageId: body.language_id,
        dialectId: body.dialect_id,
        lemma: body.lemma,
        notes: body.notes,
        wordType: body.word_type,
        meanings: body.meanings.map((m, i) => ({
          wordClassId: m.word_class_id,
          definition: m.definition,
          orderIndex: m.order_index ?? i + 1,
          translations: m.translations.map((t) => ({
            languageId: t.language_id,
            translationText: t.translation_text,
            translationType: t.translation_type,
          })),
          examples: m.examples?.map((e) => ({
            sourceLanguageId: e.source_language_id,
            sourceSentence: e.source_sentence,
            targetLanguageId: e.target_language_id,
            targetSentence: e.target_sentence,
            sourceType: e.source_type,
          })),
        })),
        categoryIds: body.category_ids,
        relatedWords: (body.related_words ?? []).map((rel) => ({
          wordId: rel.word_id,
          relationType: rel.relation_type,
        })),
        variants: body.variants?.map((v) => ({
          form: v.form,
          variantType: v.variant_type,
          affixType: v.affix_type,
          affixValue: v.affix_value,
          dialectId: v.dialect_id,
          notes: v.notes,
        })),
        pronunciation: body.pronunciation,
        images: body.images?.map((img) => ({
          url: img.url,
          provider: this.deps.imageProviderName,
          providerFileId: img.provider_file_id,
          altText: img.alt_text,
          isPrimary: img.is_primary,
        })),
        status: body.status,
      },
      { userId: actor.user_id, role: actor.role, requestId },
    );

    // Event bisnis + request_id menyambung log & jejak audit (Section 14)
    logger.info(
      { request_id: requestId, word_id: word.id, lemma: word.lemma, status: word.status },
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
          created_at: word.createdAt.toISOString(),
          ...(warnings.length > 0 ? { warnings } : {}),
        },
      },
      201,
    );
  }

  async detail(c: Context, id: string) {
    const word = await this.deps.getById.execute(id);
    return c.json({
      success: true as const,
      data: {
        id: word.id,
        lemma: word.lemma,
        language_id: word.languageId,
        notes: word.notes,
        word_type: word.wordType,
        status: word.status,
        meanings: word.meanings.map((m) => ({
          word_class_id: m.wordClassId,
          definition: m.definition,
          order_index: m.orderIndex,
          translations: m.translations.map((t) => ({
            language_id: t.languageId,
            translation_text: t.translationText,
            translation_type: t.translationType,
          })),
          examples: m.examples.map((e) => ({
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
          url: img.url,
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
      },
    });
  }

  async search(c: Context, query: SearchWordsQueryBody) {
    const { items, meta } = await this.deps.search.execute({
      q: query.q,
      limit: query.limit,
      cursor: query.cursor,
      searchIn: query.search_in,
      translationLanguageId: query.translation_language_id,
      wordType: query.word_type,
    });
    return c.json({
      success: true as const,
      data: items.map((w) => ({
        id: w.id,
        lemma: w.lemma,
        language_id: w.languageId,
        language_code: w.languageCode,
        word_type: w.wordType,
        status: w.status,
        ...(w.matchedTranslation !== undefined
          ? { matched_translation: w.matchedTranslation }
          : {}),
      })),
      meta,
    });
  }

  async wordClasses(c: Context) {
    const items = await this.deps.listWordClasses();
    return c.json({
      success: true as const,
      data: items.map((wc) => ({
        id: wc.id,
        code: wc.code,
        name: wc.name,
        parent_id: wc.parentId,
      })),
    });
  }
}
