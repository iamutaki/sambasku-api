// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
// Section 22 (approval gate): pending_review/rejected hanya di-set sistem
export type WordStatus = 'draft' | 'pending_review' | 'published' | 'rejected';
export type WordType = 'word' | 'idiom' | 'peribahasa' | 'ungkapan';
/** Status publikasi konten anak (pronunciations/images/examples) - tanpa draft */
export type ChildStatus = 'pending_review' | 'published' | 'rejected';

export interface Word {
  id: string;
  languageId: string;
  lemma: string;
  notes: string | null;
  wordType: WordType;
  status: WordStatus;
  isVerified: boolean;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  isCorrected: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

export interface WordSummary {
  id: string;
  lemma: string;
  languageId: string;
  languageCode: string;
  wordType: WordType;
  status: WordStatus;
  isVerified: boolean;
  /** terisi saat pencarian terjemahan (Indonesia→Sambas): teks yang cocok */
  matchedTranslation?: string;
  /** 11: terisi saat pencarian lemma cocok lewat variasi penulisan (formnya) */
  matchedVariant?: string;
}

export interface RelatedWordRef {
  wordId: string;
  lemma: string;
  relationType: string;
}

export interface WordVariantRef {
  id: string;
  form: string;
  variantType: string;
  affixType: string | null;
  affixValue: string | null;
  dialectId: string | null;
  notes: string | null;
}

export interface WordDetail extends Word {
  meanings: import('./meaning.entity').MeaningDetail[];
  categories: { id: string; name: string }[];
  pronunciations: {
    id: string;
    notation: string;
    value: string;
    dialectId: string | null;
    /** terisi saat includeAllStatuses (layar review); publik selalu published */
    status?: ChildStatus;
    isVerified?: boolean;
    isCorrected?: boolean;
  }[];
  images: {
    id: string;
    url: string;
    /** wajib dibawa form edit untuk round-trip PUT (full-replace images[]) */
    providerFileId: string;
    altText: string | null;
    isPrimary: boolean;
    status?: ChildStatus;
    isVerified?: boolean;
    isCorrected?: boolean;
  }[];
  /** relasi keluar (mis. peribahasa → komponen; kata → sinonim/antonim) */
  relatedWords: RelatedWordRef[];
  /** relasi masuk (mis. komponen → "muncul dalam" peribahasa) - derived, tak disimpan */
  appearsIn: RelatedWordRef[];
  variants: WordVariantRef[];
}

export interface WordClassSummary {
  id: string;
  code: string;
  name: string;
  // Nama lain yang lebih dikenal user (Verba → "Kata Kerja")
  alias: string | null;
  description: string | null;
  parentId: string | null;
}
