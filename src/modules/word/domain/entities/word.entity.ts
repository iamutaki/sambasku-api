// Entitas domain — murni TypeScript, tidak tahu Drizzle/HTTP
export type WordStatus = 'draft' | 'pending_review' | 'published';
export type WordType = 'word' | 'idiom' | 'peribahasa' | 'ungkapan';

export interface Word {
  id: string;
  languageId: string;
  lemma: string;
  notes: string | null;
  wordType: WordType;
  status: WordStatus;
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
  /** terisi saat pencarian terjemahan (Indonesia→Sambas): teks yang cocok */
  matchedTranslation?: string;
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
  pronunciations: { id: string; notation: string; value: string; dialectId: string | null }[];
  images: { url: string; altText: string | null; isPrimary: boolean }[];
  /** relasi keluar (mis. peribahasa → komponen; kata → sinonim/antonim) */
  relatedWords: RelatedWordRef[];
  /** relasi masuk (mis. komponen → "muncul dalam" peribahasa) — derived, tak disimpan */
  appearsIn: RelatedWordRef[];
  variants: WordVariantRef[];
}

export interface WordClassSummary {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
}
