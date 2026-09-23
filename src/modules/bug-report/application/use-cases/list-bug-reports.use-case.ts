import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { BugReport, BugReportListFilter } from '../../domain/entities/bug-report.entity';
import type { BugReportRepository } from '../../domain/repositories/bug-report.repository';

export class ListBugReportsUseCase {
  constructor(private readonly repo: BugReportRepository) {}

  execute(filter: BugReportListFilter): Promise<CursorPage<BugReport>> {
    return this.repo.list(filter);
  }
}
