import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  BugReport,
  BugReportListFilter,
  BugReportStatus,
  NewBugReport,
} from '../entities/bug-report.entity';

export interface BugReportRepository {
  create(input: NewBugReport): Promise<BugReport>;
  findById(id: string): Promise<BugReport | null>;
  list(filter: BugReportListFilter): Promise<CursorPage<BugReport>>;
  resolve(input: {
    id: string;
    status: Exclude<BugReportStatus, 'open'>;
    note: string | null;
    actorId: string;
  }): Promise<BugReport | null>;
}
