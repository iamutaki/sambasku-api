import { NotFoundError } from '@/shared/errors/app-error';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { WordReport, WordReportListFilter } from '../../domain/entities/word-report.entity';
import type { WordReportRepository } from '../../domain/repositories/word-report.repository';

export class ListWordReportsUseCase {
  constructor(private readonly reports: WordReportRepository) {}

  execute(filter: WordReportListFilter): Promise<CursorPage<WordReport>> {
    return this.reports.list(filter);
  }

  async getById(id: string): Promise<WordReport> {
    const row = await this.reports.findById(id);
    if (!row) {
      throw new NotFoundError('WORD_REPORT_NOT_FOUND', 'Laporan entri tidak ditemukan');
    }
    return row;
  }
}
