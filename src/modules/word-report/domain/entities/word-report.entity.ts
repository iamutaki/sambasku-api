import type { TakedownReasonCode } from '@/modules/word/domain/entities/word.entity';

export type WordReportStatus = 'open' | 'resolved';
export type WordReportResolution = 'dismissed' | 'taken_down' | 'corrected';

export interface WordReport {
  id: string;
  wordId: string;
  wordLemma: string;
  wordStatus: string;
  userId: string;
  username: string | null;
  reasonCode: TakedownReasonCode;
  note: string | null;
  status: WordReportStatus;
  resolution: WordReportResolution | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface NewWordReport {
  wordId: string;
  userId: string;
  reasonCode: TakedownReasonCode;
  note: string | null;
}

export interface WordReportListFilter {
  status?: WordReportStatus;
  limit: number;
  cursor?: string;
}
