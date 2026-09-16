import type { CreateWordDto } from '../../application/dto/create-word.dto';
import type { CreateWordBody } from './validators/create-word.validator';

// Mapping snake_case (API) → camelCase (DTO) — dipakai create-word dan
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
      provider: imageProviderName,
      providerFileId: img.provider_file_id,
      altText: img.alt_text,
      isPrimary: img.is_primary,
    })),
    status: body.status,
  };
}
