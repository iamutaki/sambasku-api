import type { UsageLabel } from '@/shared/constants/usage-labels';
import type { ImageContentWarning } from '@/shared/constants/image-content-warnings';

// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
// Section 22 (approval gate): pending_review/rejected hanya di-set sistem
export type WordStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'taken_down';

/** Alasan laporan / takedown entri. `other` dan `duplicate` wajib catatan. */
export const TAKEDOWN_REASON_CODES = [
  'not_sambas',
  'inaccurate',
  'duplicate',
  'inappropriate',
  'spam',
  'other',
] as const;
export type TakedownReasonCode = (typeof TAKEDOWN_REASON_CODES)[number];

/** Alasan laporan: takedown + laporan foto kekerasan. */
export const WORD_REPORT_REASON_CODES = [
  ...TAKEDOWN_REASON_CODES,
  'violent_image',
] as const;
export type WordReportReasonCode = (typeof WORD_REPORT_REASON_CODES)[number];
export type WordType = 'word' | 'idiom' | 'peribahasa' | 'ungkapan';
/** Status publikasi konten anak (pronunciations/images/examples) - tanpa draft */
export type ChildStatus = 'pending_review' | 'published' | 'rejected';

export interface Word {
  id: string;
  languageId: string;
  lemma: string;
  /** true = koma di lemma literal, bukan multi-kata (tab Pemisahan). */
  lemmaAllowsComma: boolean;
  notes: string | null;
  wordType: WordType;
  usageLabels: UsageLabel[];
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
  takedownReasonCode: string | null;
  takedownNote: string | null;
  takenDownBy: string | null;
  takenDownAt: Date | null;
}

export interface WordSummary {
  id: string;
  lemma: string;
  languageId: string;
  languageCode: string;
  wordType: WordType;
  usageLabels: UsageLabel[];
  status: WordStatus;
  isVerified: boolean;
  /** terisi saat pencarian terjemahan (Indonesia→Sambas): teks yang cocok */
  matchedTranslation?: string;
  /** 11: terisi saat pencarian lemma cocok lewat variasi penulisan (formnya) */
  matchedVariant?: string;
  /**
   * Ringkas gloss daftar: `[n] makan,[v] santap` (kode kelas + terjemahan).
   * GET /words (A-Z) dan GET /words/search. Feed /latest memakai
   * `LatestWordSummary.sense` dengan semantik berbeda (satu baris definisi).
   */
  sense?: string | null;
}

/** Item feed beranda: kata published, urut waktu persetujuan. */
export interface LatestWordSummary extends WordSummary {
  /** COALESCE(verified_at, created_at) - waktu tayang/persetujuan. */
  approvedAt: Date;
  /** Definisi makna published pertama, atau terjemahan pertama bila definisi kosong. */
  sense: string | null;
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
    /** Provider storage / stock (imagekit staging, github, pexels, …) */
    provider: string;
    /** wajib dibawa form edit untuk round-trip PUT (full-replace images[]) */
    providerFileId: string;
    sha?: string | null;
    altText: string | null;
    isPrimary: boolean;
    /** Peringatan visual per foto (closed enum). */
    contentWarnings: ImageContentWarning[];
    status?: ChildStatus;
    /** selalu diisi agar mapper publik bisa redact staging ImageKit */
    isVerified: boolean;
    isCorrected?: boolean;
  }[];
  /** Audio pelafalan lemma (example_id IS NULL). Multi-take. */
  audios: {
    id: string;
    url: string;
    dialectId: string | null;
    speakerName: string | null;
    durationMs: number | null;
    isPrimary: boolean;
    mimeType: string;
    status?: ChildStatus;
    isVerified?: boolean;
    isCorrected?: boolean;
  }[];
  /** relasi keluar (mis. peribahasa → komponen; kata → sinonim/antonim) */
  relatedWords: RelatedWordRef[];
  /** relasi masuk (mis. komponen → "muncul dalam" peribahasa) - derived, tak disimpan */
  appearsIn: RelatedWordRef[];
  variants: WordVariantRef[];
  /** JOIN users pada words.verified_by; tetap ada meski user soft-deleted */
  verifier: { username: string; role: string } | null;
  /** JOIN users pada words.created_by; username publik, bukan id */
  creator: { username: string; role: string } | null;
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
