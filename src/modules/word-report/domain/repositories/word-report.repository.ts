import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  NewWordReport,
  WordReport,
  WordReportListFilter,
  WordReportResolution,
} from '../entities/word-report.entity';

export interface WordReportRepository {
  create(input: NewWordReport): Promise<WordReport>;
  findOpenByUserAndWord(userId: string, wordId: string): Promise<WordReport | null>;
  findById(id: string): Promise<WordReport | null>;
  list(filter: WordReportListFilter): Promise<CursorPage<WordReport>>;
  /** Tutup satu laporan yang masih open. false jika bukan open. */
  resolveOne(input: {
    id: string;
    resolution: Exclude<WordReportResolution, 'taken_down'>;
    note: string | null;
    actorId: string;
  }): Promise<boolean>;
  /** Tutup semua laporan open pada satu kata (efek takedown). */
  closeOpenForWord(wordId: string, actorId: string, note: string | null): Promise<void>;
}
