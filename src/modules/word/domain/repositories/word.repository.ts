import type {
  ChildStatus,
  Word,
  WordClassSummary,
  WordDetail,
  WordStatus,
  WordSummary,
  WordType,
} from '../entities/word.entity';
import type { CreateWordDto, RelationType } from '../../application/dto/create-word.dto';

// status & isVerified & isCorrected di-override use case
// (Section 22 - approval gate; resolvePublication)
export type WordToSave = Omit<CreateWordDto, 'status'> & {
  status: WordStatus;
  isVerified: boolean;
  isCorrected?: boolean;
};

export interface ReferenceCheck {
  languageId: string;
  dialectId?: string;
  wordClassIds: string[];
  /** semua language_id yang direferensikan translations + examples */
  languageIds: string[];
  categoryIds: string[];
  relatedWordIds: string[];
  variantDialectIds: string[];
  /** 04: referensi dari kata inline (Form B) - SATU query gabungan dgn induk */
  inline: {
    wordClassIds: string[];
    languageIds: string[];
    categoryIds: string[];
    variantDialectIds: string[];
  };
}

export interface MissingReferences {
  languageId: boolean;
  dialectId: boolean;
  languages: string[];
  wordClasses: string[];
  categories: string[];
  words: string[];
  dialects: string[];
  /** 04: id hilang milik kata inline - dipetakan use case ke field path
   *  related_words.N.word.* */
  inlineWordClasses: string[];
  inlineLanguages: string[];
  inlineCategories: string[];
  inlineDialects: string[];
}

// 04-api-sinonim-inline.md - Related ter-resolusi use case, siap insert
// dalam transaksi yang sama dgn kata induk.
export interface ResolvedInlineRelation {
  relationType: RelationType;
  inlineWord: WordToSave;
  /**
   * Provenance inherit makna (kolom meanings.inherited_from_meaning_id).
   * key = indeks 0-based di meanings inline; value = indeks 0-based makna
   * INDUK yang jadi sumber salinan (dipecahkan ke row id di dalam transaksi).
   * ABSENT = makna mandiri (inherit=false) ATAU sudah di-override →
   * kolom NULL (= makna sudah "selesai mengikuti" induknya).
   */
  inheritedFrom?: Record<number, number>;
  /** 04: berapa makna yang asalnya disalin dari induk (inherit path) */
  inheritedMeaningsCount: number;
  /** 04: berapa makna yang di-override lewat meaning_overrides */
  overriddenMeaningsCount: number;
}

export interface InlineCreatedWordSummary {
  id: string;
  lemma: string;
  relationType: RelationType;
  wordType: WordType;
  status: WordStatus;
  isVerified: boolean;
  meaningsCount: number;
  inheritedMeaningsCount: number;
  overriddenMeaningsCount: number;
}

export interface SaveWithInlineResult {
  word: Word;
  inlineCreatedWords: InlineCreatedWordSummary[];
}

// Pagination cursor-based (base-stack.md Section 13): cursor = ULID id
// item terakhir halaman sebelumnya; urutan id DESC (terbaru dulu).
// searchIn: 'lemma' = Sambas→Indonesia (default); 'translation' = Indonesia→Sambas
// (cari kata Sambas yang terjemahannya cocok - reverse lookup)
export interface SearchParams {
  q: string;
  limit: number;
  cursor?: string;
  searchIn?: 'lemma' | 'translation';
  translationLanguageId?: string;
  /** filter jenis entri: word | idiom | peribahasa | ungkapan */
  wordType?: string;
  /** filter verifikasi (Section 22) */
  isVerified?: boolean;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Kontrak repository modul word - implementasi Drizzle di infrastructure/.
// saveWithRelations & saveWithInlineRelations DIJAMIN atomik (satu
// db.transaction) - use case tidak perlu tahu soal transaction
// (docs/api/01-api-tambah-kata.md & 04-api-sinonim-inline.md).
export interface WordRepository {
  saveWithRelations(word: WordToSave, actorId: string): Promise<Word>;
  /**
   * 04: simpan induk + N kata inline (Form B) + relasi + contributions dalam
   * SATU transaksi atomik. Rollback jika salah satu insert gagal → TIDAK ada
   * baris tersisa (induk pun).
   */
  saveWithInlineRelations(
    word: WordToSave,
    actorId: string,
    related: ResolvedInlineRelation[],
  ): Promise<SaveWithInlineResult>;
  /** true kalau lemma sama sudah ada di language itu (belum soft-deleted) */
  findDuplicate(languageId: string, lemma: string): Promise<boolean>;
  /** hanya published + belum soft-deleted; includeAllStatuses = layar review */
  findDetailById(id: string, opts?: { includeAllStatuses?: boolean }): Promise<WordDetail | null>;
  /** kata by id (belum soft-deleted, semua status) - validasi parent kontribusi media */
  findById(id: string): Promise<Word | null>;
  /** replace semantics: hapus children lama, insert baru - satu transaksi.
   *  Dipakai correct-contribution (modul contribution) & update admin (menyusul) */
  updateWithRelations(id: string, word: WordToSave, actorId: string): Promise<Word | null>;
  search(params: SearchParams): Promise<CursorPage<WordSummary>>;
  findMissingReferences(refs: ReferenceCheck): Promise<MissingReferences>;
  /** data referensi dropdown kelas kata (hierarki parent) */
  listWordClasses(): Promise<WordClassSummary[]>;
  /**
   * Set flag verifikasi (Section 22). Return false kalau kata tidak
   * ditemukan / sudah soft-deleted - use case yang menerjemahkan ke 404.
   */
  setVerified(
    id: string,
    data: { isVerified: boolean; verifiedBy: string; verifiedAt: Date },
  ): Promise<boolean>;

  // ---- Kontribusi media (03-api-kontribusi-verifikasi.md) ----

  /** makna by id (belum soft-deleted) - untuk validasi parent contoh kalimat */
  findMeaningById(meaningId: string): Promise<{ id: string; wordId: string } | null>;

  /** Insert pelafalan pada kata existing + baris contributions - satu transaksi */
  addPronunciation(
    wordId: string,
    data: {
      dialectId?: string | null;
      notation: string;
      value: string;
      audioUrl?: string | null;
      speakerName?: string | null;
      notes?: string | null;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<PronunciationMedia>;

  /** Insert gambar pada kata existing + baris contributions - satu transaksi */
  addWordImage(
    wordId: string,
    data: {
      url: string;
      providerFileId: string;
      altText?: string | null;
      isPrimary: boolean;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<WordImageMedia>;

  /** Insert contoh kalimat pada makna existing + baris contributions - satu transaksi */
  addExample(
    meaningId: string,
    data: {
      sourceLanguageId: string;
      sourceSentence: string;
      targetLanguageId?: string | null;
      targetSentence?: string | null;
      sourceType?: string | null;
      notes?: string | null;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<ExampleMedia>;
}

/** Entitas konten anak hasil kontribusi media (03 doc) */
export interface PronunciationMedia {
  id: string;
  wordId: string;
  dialectId: string | null;
  notation: string;
  value: string;
  audioUrl: string | null;
  speakerName: string | null;
  notes: string | null;
  status: ChildStatus;
  isVerified: boolean;
  isCorrected: boolean;
}

export interface WordImageMedia {
  id: string;
  wordId: string;
  provider: string;
  providerFileId: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  status: ChildStatus;
  isVerified: boolean;
  isCorrected: boolean;
}

export interface ExampleMedia {
  id: string;
  meaningId: string;
  sourceLanguageId: string;
  sourceSentence: string;
  targetLanguageId: string | null;
  targetSentence: string | null;
  sourceType: string | null;
  notes: string | null;
  status: ChildStatus;
  isVerified: boolean;
  isCorrected: boolean;
}
