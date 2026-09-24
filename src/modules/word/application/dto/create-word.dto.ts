import type { UsageLabel } from '@/shared/constants/usage-labels';

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
  /** 17-api-usul-definisi.md: false = placeholder "-" (belum ada definisi). */
  isHaveDefinition?: boolean;
  /** false = sengaja tanpa padanan kata Indonesia (definisi uraian sudah ada). */
  isHaveTranslation?: boolean;
  orderIndex: number;
  translations: CreateWordTranslationDto[];
  examples?: CreateWordExampleDto[];
}

export interface CreateWordImageDto {
  url: string;
  /** Stock Media Explorer ATAU nama storage aktif (dari presentation layer) */
  provider: string;
  providerFileId: string;
  /** Blob sha GitHub — opsional; stock / ImageKit lama null */
  sha?: string | null;
  altText?: string;
  isPrimary?: boolean;
}

export type WordType = 'word' | 'idiom' | 'peribahasa' | 'ungkapan';
export type RelationType = 'synonym' | 'antonym' | 'has_component' | 'derived_from';
export type PublicationRequested = 'draft' | 'published';

// 04-api-sinonim-inline.md - override SATU PER SATU atas hasil salinan
// (inherit makna induk). translate-and-replace: field yang TIDAK disebut
// tetap memakai hasil salinan; translations/examples = replace total.
export interface MeaningOverrideDto {
  /** indeks 0-based makna INDUK yang mau dimodifikasi */
  meaningIndex: number;
  definition?: string;
  wordClassId?: string;
  translations?: CreateWordTranslationDto[];
  examples?: CreateWordExampleDto[];
}

// 04-api-sinonim-inline.md - kata baru yang dibuat INLINE dalam satu request
// (Form B related_words). Mengikuti kaidah CreateWordDto (subset).
export interface InlineWordDto {
  lemma: string;
  notes?: string;
  wordType?: WordType;
  usageLabels?: UsageLabel[];
  categoryIds?: string[];
  /**
   * DEFAULT true - ikut definisi/makna induk (disalin materialized).
   * false → field `meanings` WAJIB diisi penuh.
   */
  inheritMeanings?: boolean;
  /** hanya sah saat inheritMeanings=true; indeks mengacu makna induk */
  meaningOverrides?: MeaningOverrideDto[];
  /** wajib DAN hanya saat inheritMeanings=false */
  meanings?: CreateWordMeaningDto[];
  variants?: CreateWordVariantDto[];
  pronunciation?: { notation: string; value: string };
  images?: CreateWordImageDto[];
  /** default: ikut status yang dikirim di body induk */
  status?: PublicationRequested;
}

// Form A - tautkan ke kata yang SUDAH ada (01).
// Form B - buat kata baru INLINE (04). Tepat satu bentuk per item.
export type CreateWordRelatedDto =
  | { wordId: string; relationType: RelationType }
  | { relationType: RelationType; word: InlineWordDto };

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
  usageLabels: UsageLabel[];
  meanings: CreateWordMeaningDto[];
  categoryIds: string[];
  relatedWords: CreateWordRelatedDto[];
  variants?: CreateWordVariantDto[];
  pronunciation?: { notation: string; value: string };
  /** gambar contoh hasil direct-upload (referensi URL + file id provider) */
  images?: CreateWordImageDto[];
  status: 'draft' | 'published';
  /** Provenance jalur search-miss (12-api) - opsional */
  searchMissId?: string;
}
