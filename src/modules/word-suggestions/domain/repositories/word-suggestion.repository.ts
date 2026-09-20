import type { WordEditSuggestion, SuggestionStatus, SuggestionDetail, SuggestionSummary } from '../entities/word-suggestion.entity';
import type { ProposedChanges } from '../entities/word-suggestion.entity';

// Kontrak repository modul word-suggestions - implementasi Drizzle di
// infrastructure/. Dipakai oleh use case, TIDAK boleh tahu soal HTTP/Hono.
export interface WordSuggestionRepository {
  /** Buat usulan baru */
  createSuggestion(
    userId: string,
    wordId: string,
    proposedChanges: ProposedChanges,
    reason: string,
    reasonCode: string,
  ): Promise<WordEditSuggestion>;

  /** List usulan dengan filter status + cursor pagination (DESC id) */
  listSuggestions(opts: {
    status?: SuggestionStatus;
    limit: number;
    cursor?: string;
  }): Promise<{ items: SuggestionSummary[]; nextCursor: string | null; hasMore: boolean }>;

  /** Detail usulan + snapshot kata saat ini + diff (WAJIB join users + words) */
  getSuggestionDetail(id: string): Promise<SuggestionDetail | null>;

  /** Ambil usulan by id (tanpa join - untuk validasi & update status) */
  findById(id: string): Promise<WordEditSuggestion | null>;

  /** Approve: terapkan proposed_changes ke kata + update status.
   *  Return { applied: boolean; changesApplied: number; wordLemma: string }
   *  changesApplied = jumlah perubahan yang berhasil diaplikasikan.
   *  WAJIB atomic ( satu transaksi) - rollback jika ada bagian gagal.
   */
  approveSuggestion(id: string, reviewerId: string, comment?: string): Promise<{ applied: boolean; changesApplied: number; wordLemma: string; wordId: string }>;

  /** Reject: update status + review comment. Return true kalau berhasil. */
  rejectSuggestion(id: string, reviewerId: string, comment: string): Promise<boolean>;

  /** Correct: replace proposed_changes + update status (pending atau corrected).
   *  Kalau publish=true: terapkan perubahan + status 'corrected'.
   *  Kalau publish=false: status tetep 'pending', proposed_changes diganti.
   */
  correctSuggestion(
    id: string,
    reviewerId: string,
    correctedChanges: ProposedChanges,
    publish: boolean,
    comment?: string,
  ): Promise<{ applied: boolean; changesApplied: number; status: SuggestionStatus; wordLemma: string }>;

  /** Riwayat perubahan kata: gabung audit_logs + users + suggestion info */
  getChangeHistory(wordId: string, limit: number, cursor?: string): Promise<{ items: ChangeHistoryItem[]; nextCursor: string | null; hasMore: boolean }>;
}

export interface ChangeHistoryItem {
  id: string;
  timestamp: Date;
  actorUserId: string;
  actorUsername: string | null;
  type: 'direct_edit' | 'suggest_edit';
  changes: ChangeRecord[];
  source: SuggestionSource | null;
}

export interface ChangeRecord {
  entity: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  displayOld: string;
  displayNew: string;
}

export interface SuggestionSource {
  suggestionId: string;
  suggestedByUserId: string;
  suggestedByUsername: string;
  reason: string;
  reviewerUserId: string | null;
  reviewerUsername: string | null;
  reviewComment: string | null;
}
