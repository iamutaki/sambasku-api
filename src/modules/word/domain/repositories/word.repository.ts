import type {
  ChildStatus,
  LatestWordSummary,
  Word,
  WordClassSummary,
  WordDetail,
  WordStatus,
  WordSummary,
  WordType,
} from '../entities/word.entity';
import type { CreateWordDto, RelationType } from '../../application/dto/create-word.dto';
import type { MeaningMedia } from '../entities/meaning.entity';
import type { ImageContentWarning } from '@/shared/constants/image-content-warnings';

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

/** Satu entri dalam kelompok lemma duplikat (tab Duplikasi). */
export interface DuplicateWordItem {
  id: string;
  lemma: string;
  languageId: string;
  languageCode: string;
  wordType: WordType;
  status: WordStatus;
  isVerified: boolean;
  meaningsCount: number;
  createdAt: Date;
}

/** Kelompok 2+ entri aktif dengan lemma sama (case-insensitive) + bahasa. */
export interface DuplicateWordGroup {
  lemma: string;
  languageId: string;
  languageCode: string;
  items: DuplicateWordItem[];
}

/** Kandidat pecah lemma berkoma (tab Pemisahan). */
export interface CommaSplitLemmaCandidate {
  wordId: string;
  lemma: string;
  languageId: string;
  languageCode: string;
  wordType: WordType;
  status: WordStatus;
  isVerified: boolean;
  meaningsCount: number;
  suggestedParts: string[];
  meaningPreview: string[];
  /** Padanan pertama, untuk pratinjau field yang masih bisa diganti. */
  copiedTranslation: string;
  /** Definisi pertama yang bukan placeholder, kosong bila tidak ada. */
  copiedDefinition: string;
}

/** Satu bagian tambahan saat pecah lemma: salin makna, atau ganti. */
export type LemmaSplitMeaningOverride =
  | { mode: 'copy' }
  | {
      mode: 'replace';
      translationText: string;
      definition: string | null;
      wordClassId: string | null;
      meaningSource: 'manual' | 'kbbi';
    };

export interface LemmaSplitMeaningSnapshot {
  translationTexts: string[];
  definition: string | null;
}

export interface LemmaSplitCreatedWord {
  wordId: string;
  lemma: string;
  mode: 'copy' | 'replace';
  translationText: string;
  meaningSource: 'copied' | 'manual' | 'kbbi';
}

export interface LemmaSplitResult {
  wordId: string;
  keptLemma: string;
  oldLemma: string;
  meanings: LemmaSplitMeaningSnapshot[];
  created: LemmaSplitCreatedWord[];
}

/** Kandidat pecah padanan berkoma → beberapa makna. */
export interface CommaSplitTranslationCandidate {
  meaningTranslationId: string;
  meaningId: string;
  wordId: string;
  lemma: string;
  translationText: string;
  languageId: string;
  languageCode: string;
  suggestedParts: string[];
  definition: string;
  wordClassId: string | null;
}

export interface CommaSplitCandidates {
  lemmas: CommaSplitLemmaCandidate[];
  translations: CommaSplitTranslationCandidate[];
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
  /**
   * Filter tayang (panel admin Kata). Publik selalu `true`.
   * - true  → hanya published
   * - false → selain published (draft/pending_review/rejected)
   * - omit  → semua status (belum soft-deleted)
   */
  published?: boolean;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// 18-api-list-words.md - browsing A-Z publik. Cursor komposit (lemma, id):
// lemma tidak unik, id wajib tie-breaker. BEDA bentuk dari ULID tunggal
// search() - client memperlakukan cursor sebagai opaque.
export interface ListAtoZParams {
  q: string;
  /** Satu huruf A–Z: prefix lemma (panel A-Z). Beda dari `q` = contains. */
  letter?: string;
  limit: number;
  wordType?: string;
  cursor?: { lemma: string; id: string };
}

const LIST_CURSOR_SEP = '\x00';

/** Encode compound cursor (lemma, id) ke base64url string. Pure function. */
export function encodeListCursor(c: { lemma: string; id: string }): string {
  return Buffer.from(`${c.lemma}${LIST_CURSOR_SEP}${c.id}`).toString('base64url');
}

/**
 * Decode cursor string ke (lemma, id). Domain melempar generic Error saja
 * (pola decodeAdminCursor vote) - use case yang wrap ke ValidationError.
 */
export function decodeListCursor(s: string): { lemma: string; id: string } {
  const parts = Buffer.from(s, 'base64url').toString().split(LIST_CURSOR_SEP);
  if (parts.length !== 2 || !parts[0] || parts[1].length !== 26) {
    throw new Error('INVALID_CURSOR_FORMAT');
  }
  return { lemma: parts[0], id: parts[1] };
}

/** Feed beranda. Cursor komposit (approvedAt ISO, id) — opaque bagi klien. */
export interface ListLatestParams {
  limit: number;
  cursor?: { approvedAt: Date; id: string };
}

export function encodeLatestCursor(c: { approvedAt: Date; id: string }): string {
  return Buffer.from(`${c.approvedAt.toISOString()}${LIST_CURSOR_SEP}${c.id}`).toString('base64url');
}

export function decodeLatestCursor(s: string): { approvedAt: Date; id: string } {
  const parts = Buffer.from(s, 'base64url').toString().split(LIST_CURSOR_SEP);
  const approvedAt = parts.length === 2 ? new Date(parts[0]) : new Date(NaN);
  if (parts.length !== 2 || Number.isNaN(approvedAt.getTime()) || parts[1].length !== 26) {
    throw new Error('INVALID_CURSOR_FORMAT');
  }
  return { approvedAt, id: parts[1] };
}

// Kontrak repository modul word - implementasi Drizzle di infrastructure/.
/** Field audit koreksi kata - tanpa memuat anak (meanings/media/relasi). */
export interface WordAuditSnapshot {
  lemma: string;
  status: WordStatus;
  isVerified: boolean;
}

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
  /** true kalau lemma sama sudah ada di language itu (belum soft-deleted).
   *  excludeWordId (05-api-edit-kata.md): cek duplikat EDIT harus mengabaikan
   *  kata itu sendiri - tanpa ini setiap edit selalu "duplikat" dirinya. */
  findDuplicate(languageId: string, lemma: string, excludeWordId?: string): Promise<boolean>;
  /** Lemma aktif (belum dihapus), apa pun status tayangnya. Null = boleh dibuat baru. */
  findActiveByLemma(
    languageId: string,
    lemma: string,
  ): Promise<{ id: string; status: WordStatus } | null>;
  /** Sidik makna yang sudah ada, untuk menolak impor ulang yang sama. */
  listMeaningKeys(wordId: string): Promise<
    { definition: string; translation: string; isHaveDefinition: boolean; isHaveTranslation: boolean }[]
  >;
  /** hanya published + belum soft-deleted; includeAllStatuses = layar review */
  findDetailById(id: string, opts?: { includeAllStatuses?: boolean }): Promise<WordDetail | null>;
  /**
   * Snapshot tipis untuk audit koreksi (lemma/status/is_verified saja).
   * Hindari findDetailById (~12 round-trip) saat old_data audit hanya butuh 3 field.
   */
  findAuditSnapshotById(id: string): Promise<WordAuditSnapshot | null>;
  /** Resolusi URL publik /words/<lemma> → id entri published. Homonim
   *  (lemma sama di >1 entri): terverifikasi & terlama menang (deterministik). */
  findPublishedIdByLemma(lemma: string): Promise<string | null>;
  /**
   * 28-api-word-of-the-day.md: id kata published untuk tanggal WIB
   * ('YYYY-MM-DD'). Deterministik: ORDER BY md5(id || ':' || date) -
   * semua user melihat kata sama per hari. Null = korpus kosong.
   */
  findWordOfDayId(date: string): Promise<string | null>;
  /** kata by id (belum soft-deleted, semua status) - validasi parent kontribusi media */
  findById(id: string): Promise<Word | null>;
  /** replace semantics: hapus children lama, insert baru - satu transaksi.
   *  Dipakai correct-contribution (modul contribution) & update admin (menyusul) */
  updateWithRelations(id: string, word: WordToSave, actorId: string, tx?: unknown): Promise<Word | null>;
  search(params: SearchParams): Promise<CursorPage<WordSummary>>;
  /**
   * 18-api-list-words.md: daftar semua kata published urut
   * lower(lemma) COLLATE "C" ASC, id ASC (browsing A-Z case-insensitive).
   * q = filter ILIKE %q% pada lemma saja - tanpa variasi penulisan,
   * tanpa rekaman search-miss. published + deleted_at IS NULL dijamin
   * di sini (endpoint publik, bukan opsional). nextCursor sudah
   * ter-encode (impl memanggil encodeListCursor).
   */
  listAtoZ(params: ListAtoZParams): Promise<CursorPage<WordSummary>>;
  /**
   * Feed beranda: published, urut COALESCE(verified_at, created_at) DESC, id DESC.
   * sense = definisi makna published pertama, fallback terjemahan pertama.
   */
  listLatest(params: ListLatestParams): Promise<CursorPage<LatestWordSummary>>;
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

  /**
   * Flip status tayang: published ↔ draft. Publish juga set is_verified.
   * Return false kalau kata tidak ditemukan / soft-deleted.
   */
  setPublished(
    id: string,
    data: { published: boolean; actorId: string },
  ): Promise<boolean>;

  /**
   * Tayangkan kata, atau jika sudah ada published dengan lemma sama
   * (bahasa sama, case-insensitive) → pindahkan meanings ke twin lalu
   * soft-delete sumber (12-api §8). Return null kalau id tidak ada.
   */
  publishOrMergeMeanings(
    id: string,
    actorId: string,
  ): Promise<{ wordId: string; mergedIntoWordId: string | null } | null>;

  /**
   * Kelompok lemma aktif (case-insensitive + bahasa) dengan ≥2 entri.
   * Panel tab Duplikasi.
   */
  listDuplicateGroups(): Promise<DuplicateWordGroup[]>;

  /**
   * Gabung manual: pindahkan makna/media/relasi dari mergeWordIds ke
   * keepWordId, lalu soft-delete sumber. Semua harus satu lemma+bahasa.
   */
  mergeDuplicateWords(
    keepWordId: string,
    mergeWordIds: string[],
    actorId: string,
  ): Promise<{ keepWordId: string; mergedWordIds: string[] }>;

  /** Antrean tab Pemisahan: lemma/padanan mengandung koma dan belum di-flag literal. */
  listCommaSplitCandidates(): Promise<CommaSplitCandidates>;

  /**
   * Pecah lemma: rename asli → parts[0], buat kata baru untuk sisanya.
   * Tanpa override (atau mode copy) makna disalin. mode replace menulis
   * satu makna baru dan tidak menyalin contoh/catatan/label.
   * parts harus ≥2. overrides, bila ada, panjangnya parts.length - 1.
   */
  applyCommaSplitLemma(
    wordId: string,
    parts: string[],
    overrides: LemmaSplitMeaningOverride[] | undefined,
    actorId: string,
  ): Promise<LemmaSplitResult>;

  /**
   * Pecah padanan → N makna: update padanan sumber → parts[0],
   * buat makna baru untuk sisanya.
   */
  applyCommaSplitTranslation(
    meaningTranslationId: string,
    parts: string[],
    actorId: string,
  ): Promise<{ wordId: string; meaningIds: string[] }>;

  markLemmaAllowsComma(wordId: string, actorId: string): Promise<boolean>;
  markTranslationAllowsComma(meaningTranslationId: string, actorId: string): Promise<boolean>;

  /**
   * Soft-delete kata (07-api-delete-kata.md): set deleted_at + deleted_by,
   * baris & children tetap utuh untuk audit/recovery. Semua query publik &
   * admin sudah memfilter isNull(deletedAt) → efeknya sama dengan hapus.
   * Return false kalau id tidak ditemukan / sudah soft-deleted - use case
   * yang menerjemahkan ke 404 (idempotent: delete ulang = 404).
   */
  softDelete(id: string, actorId: string): Promise<boolean>;

  /**
   * published → taken_down, simpan alasan. false jika bukan published
   * (race / status lain / sudah dihapus).
   */
  takedown(
    id: string,
    data: { actorId: string; reasonCode: string; note: string | null },
  ): Promise<boolean>;

  /**
   * taken_down → published. is_verified tidak diubah. Jejak takedown
   * dikosongkan. false jika status bukan taken_down.
   */
  restore(id: string, actorId: string): Promise<boolean>;

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
      provider: string;
      sha?: string | null;
      altText?: string | null;
      isPrimary: boolean;
      contentWarnings?: ImageContentWarning[];
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<WordImageMedia>;

  /** Set/clear peringatan visual foto (admin/verifikator atau resolve laporan). */
  setWordImageContentWarnings(
    id: string,
    contentWarnings: ImageContentWarning[],
  ): Promise<WordImageMedia | null>;

  /** Gambar hidup pada kata (untuk validasi keputusan review). */
  listWordImages(wordId: string): Promise<WordImageMedia[]>;

  /** Gambar ImageKit belum diverifikasi pada kata (untuk promote saat approve). */
  listStagingWordImages(wordId: string): Promise<WordImageMedia[]>;

  findWordImageById(id: string): Promise<WordImageMedia | null>;

  /** Setelah promote staging → GitHub. */
  applyPromotedWordImage(
    id: string,
    data: { url: string; provider: string; providerFileId: string; sha: string },
  ): Promise<void>;

  /**
   * Soft-delete foto (moderasi: jangan tayangkan / tolak).
   * Jika salah satu is_primary, primary dibersihkan (tidak auto-pilih pengganti).
   */
  softDeleteWordImages(ids: string[]): Promise<void>;

  /**
   * Insert audio pelafalan (multi) pada kata / contoh + contributions.
   * exampleId null = pelafalan lemma; terisi = pelafalan contoh.
   */
  addWordAudio(
    wordId: string,
    data: {
      exampleId?: string | null;
      dialectId?: string | null;
      provider: string;
      providerFileId: string;
      sha: string | null;
      url: string;
      mimeType: string;
      fileSize: number;
      durationMs?: number | null;
      speakerName?: string | null;
      isPrimary: boolean;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<WordAudioMedia>;

  /** Soft-delete audio + return metadata untuk best-effort storage.delete */
  softDeleteWordAudio(
    wordId: string,
    audioId: string,
  ): Promise<WordAudioMedia | null>;

  /** Hitung audio aktif (belum soft-delete) untuk target word/example — is_primary */
  countWordAudios(
    wordId: string,
    exampleId?: string | null,
  ): Promise<number>;

  /** Example by id + wordId induk (lewat meaning) — validasi upload audio example */
  findExampleWithWord(
    exampleId: string,
  ): Promise<{ id: string; meaningId: string; wordId: string } | null>;

  /** Dialect code by id (untuk path storage); null jika tidak ada */
  findDialectCode(dialectId: string): Promise<string | null>;

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

  /**
   * Resolve search-miss sebagai variasi penulisan pada kata existing.
   * Unique (word_id, form, dialect_id) - dialect null = satu form per kata.
   */
  addVariant(
    wordId: string,
    data: { form: string; variantType?: string; notes?: string | null },
    actorId: string,
  ): Promise<{ id: string; form: string; variantType: string }>;

  /**
   * Kontribusi definisi (makna) pada kata existing (17-api-usul-definisi.md)
   * + baris contributions - satu transaksi. Dipakai jalur "Bantu definisi"
   * untuk kata placeholder (is_have_definition=false).
   */
  addMeaning(
    wordId: string,
    data: {
      wordClassId?: string | null;
      definition: string;
      isHaveDefinition?: boolean;
      isHaveTranslation?: boolean;
      translations: { languageId: string; translationText: string; translationType: string }[];
      status: ChildStatus | 'draft';
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<MeaningMedia>;

  /**
   * Resolve search-miss sebagai sinonim: buat kata published baru (lemma),
   * salin makna target (inherited_from), relasi synonym dua arah.
   * searchMissId opsional untuk provenance contributions.
   */
  createSynonymWord(
    targetWordId: string,
    lemma: string,
    actorId: string,
    opts?: { searchMissId?: string | null },
  ): Promise<{ id: string; lemma: string }>;

  /**
   * Resolve search-miss arah translation: tambah terjemahan pada makna
   * pertama kata (atau meaningId bila diberi).
   */
  addTranslation(
    wordId: string,
    data: { languageId: string; translationText: string; meaningId?: string },
    actorId: string,
  ): Promise<{ meaningId: string; languageId: string; translationText: string }>;
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
  sha: string | null;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  contentWarnings: ImageContentWarning[];
  status: ChildStatus;
  isVerified: boolean;
  isCorrected: boolean;
}

export interface WordAudioMedia {
  id: string;
  wordId: string;
  exampleId: string | null;
  dialectId: string | null;
  provider: string;
  providerFileId: string;
  sha: string | null;
  url: string;
  mimeType: string;
  fileSize: number;
  durationMs: number | null;
  speakerName: string | null;
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
