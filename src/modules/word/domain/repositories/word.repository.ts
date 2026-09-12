import type { Word, WordClassSummary, WordDetail, WordStatus, WordSummary } from '../entities/word.entity';
import type { CreateWordDto } from '../../application/dto/create-word.dto';

// status di-override use case (bisa jadi 'pending_review' untuk contributor)
export type WordToSave = Omit<CreateWordDto, 'status'> & { status: WordStatus };

export interface ReferenceCheck {
  languageId: string;
  dialectId?: string;
  wordClassIds: string[];
  /** semua language_id yang direferensikan translations + examples */
  languageIds: string[];
  categoryIds: string[];
  relatedWordIds: string[];
  variantDialectIds: string[];
}

export interface MissingReferences {
  languageId: boolean;
  dialectId: boolean;
  languages: string[];
  wordClasses: string[];
  categories: string[];
  words: string[];
  dialects: string[];
}

// Pagination cursor-based (base-stack.md Section 13): cursor = ULID id
// item terakhir halaman sebelumnya; urutan id DESC (terbaru dulu).
// searchIn: 'lemma' = Sambas→Indonesia (default); 'translation' = Indonesia→Sambas
// (cari kata Sambas yang terjemahannya cocok — reverse lookup)
export interface SearchParams {
  q: string;
  limit: number;
  cursor?: string;
  searchIn?: 'lemma' | 'translation';
  translationLanguageId?: string;
  /** filter jenis entri: word | idiom | peribahasa | ungkapan */
  wordType?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Kontrak repository modul word — implementasi Drizzle di infrastructure/.
// saveWithRelations DIJAMIN atomik (satu db.transaction) — use case tidak
// perlu tahu soal transaction (docs/api/01-api-tambah-kata.md).
export interface WordRepository {
  saveWithRelations(word: WordToSave, actorId: string): Promise<Word>;
  /** true kalau lemma sama sudah ada di language itu (belum soft-deleted) */
  findDuplicate(languageId: string, lemma: string): Promise<boolean>;
  /** hanya published + belum soft-deleted */
  findDetailById(id: string): Promise<WordDetail | null>;
  search(params: SearchParams): Promise<CursorPage<WordSummary>>;
  findMissingReferences(refs: ReferenceCheck): Promise<MissingReferences>;
  /** data referensi dropdown kelas kata (hierarki parent) */
  listWordClasses(): Promise<WordClassSummary[]>;
}
