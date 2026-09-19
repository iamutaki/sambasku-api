import type {
  CreateWordDto,
  InlineWordDto,
  MeaningOverrideDto,
} from '../../application/dto/create-word.dto';
import type { UpdateWordDto } from '../../application/dto/update-word.dto';
import type { CreateWordBody } from './validators/create-word.validator';
import type { UpdateWordBody } from './validators/update-word.validator';

// Mapping snake_case (API) → camelCase (DTO) - dipakai create-word dan
// correct-contribution (modul contribution) supaya mapping tidak dobel.
// provider gambar selalu dari provider AKTIF (composition root), bukan client.
export function toCreateWordDto(body: CreateWordBody, imageProviderName: string): CreateWordDto {
  return {
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
    relatedWords: (body.related_words ?? []).map((rel) => {
      if (rel.word_id !== undefined) {
        return { wordId: rel.word_id, relationType: rel.relation_type };
      }
      return { relationType: rel.relation_type, word: toInlineWordDto(rel.word!, imageProviderName) };
    }),
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
      provider: imageProviderName,
      providerFileId: img.provider_file_id,
      altText: img.alt_text,
      isPrimary: img.is_primary,
    })),
    status: body.status,
    ...(body.search_miss_id ? { searchMissId: body.search_miss_id } : {}),
  };
}

// 05-api-edit-kata.md - body PUT (Form A saja) → UpdateWordDto.
// Mapping field non-relasi identik dengan create; related_words tidak
// punya jalur inline di edit (validator menolak Form B lebih dulu).
export function toUpdateWordDto(body: UpdateWordBody, imageProviderName: string): UpdateWordDto {
  return {
    ...toCreateWordDto({ ...body, related_words: [] }, imageProviderName),
    relatedWords: body.related_words.map((rel) => ({
      // superRefine validator menjamin kehadiran word_id saat Form B absen
      wordId: rel.word_id!,
      relationType: rel.relation_type,
    })),
  };
}

// 04: word inline (Form B) → InlineWordDto (validator menjamin bentuk sah)
function toInlineWordDto(w: InlineWordBody, imageProviderName: string): InlineWordDto {
  const overrides: MeaningOverrideDto[] | undefined = w.meaning_overrides?.map((o) => ({
    meaningIndex: o.meaning_index,
    definition: o.definition,
    wordClassId: o.word_class_id,
    translations: o.translations?.map((t) => ({
      languageId: t.language_id,
      translationText: t.translation_text,
      translationType: t.translation_type,
    })),
    examples: o.examples?.map((e) => ({
      sourceLanguageId: e.source_language_id,
      sourceSentence: e.source_sentence,
      targetLanguageId: e.target_language_id,
      targetSentence: e.target_sentence,
      sourceType: e.source_type,
    })),
  }));

  return {
    lemma: w.lemma,
    notes: w.notes,
    wordType: w.word_type as InlineWordDto['wordType'],
    categoryIds: w.category_ids,
    inheritMeanings: w.inherit_meanings ?? true,
    meaningOverrides: overrides?.length ? overrides : undefined,
    meanings: w.meanings?.map((m, i) => ({
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
    variants: w.variants?.map((v) => ({
      form: v.form,
      variantType: v.variant_type,
      affixType: v.affix_type,
      affixValue: v.affix_value,
      dialectId: v.dialect_id,
      notes: v.notes,
    })),
    pronunciation: w.pronunciation,
    images: w.images?.map((img) => ({
      url: img.url,
      provider: imageProviderName,
      providerFileId: img.provider_file_id,
      altText: img.alt_text,
      isPrimary: img.is_primary,
    })),
    status: w.status,
  };
}

// Bentuk body kata inline (Form B) - ditarik dari tipe validator supaya
// mapping tetap sinkron dengan skema (CreateWordBody['related_words'][number]['word'])
type InlineWordBody = NonNullable<CreateWordBody['related_words'][number]['word']>;