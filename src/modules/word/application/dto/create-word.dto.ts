export interface CreateWordTranslationDto {
  languageId: string;
  translationText: string;
  translationType: string;
}

export interface CreateWordExampleDto {
  sourceLanguageId: string;
  sourceSentence: string;
  targetLanguageId?: string;
  targetSentence?: string;
  sourceType?: string;
}

export interface CreateWordMeaningDto {
  wordClassId: string;
  definition: string;
  orderIndex: number;
  translations: CreateWordTranslationDto[];
  examples?: CreateWordExampleDto[];
}

export interface CreateWordImageDto {
  url: string;
  /** diisi presentation layer dari provider AKTIF (bukan dari client) */
  provider: string;
  providerFileId: string;
  altText?: string;
  isPrimary?: boolean;
}

export type WordType = 'word' | 'idiom' | 'peribahasa' | 'ungkapan';
export type RelationType = 'synonym' | 'antonym' | 'has_component' | 'derived_from';

export interface CreateWordRelatedDto {
  wordId: string;
  relationType: RelationType;
}

export interface CreateWordVariantDto {
  form: string;
  variantType: string;
  affixType?: string;
  affixValue?: string;
  dialectId?: string;
  notes?: string;
}

export interface CreateWordDto {
  languageId: string;
  dialectId?: string;
  lemma: string;
  notes?: string;
  wordType: WordType;
  meanings: CreateWordMeaningDto[];
  categoryIds: string[];
  relatedWords: CreateWordRelatedDto[];
  variants?: CreateWordVariantDto[];
  pronunciation?: { notation: string; value: string };
  /** gambar contoh hasil direct-upload (referensi URL + file id provider) */
  images?: CreateWordImageDto[];
  status: 'draft' | 'published';
}
