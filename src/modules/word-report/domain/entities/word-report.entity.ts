import type {
  TakedownReasonCode,
  WordReportReasonCode,
} from '@/modules/word/domain/entities/word.entity';

export type WordReportStatus = 'open' | 'resolved';
export type WordReportResolution = 'dismissed' | 'taken_down' | 'corrected' | 'flagged_image';

export interface WordReport {
  id: string;
  wordId: string;
  imageId: string | null;
  wordLemma: string;
  wordStatus: string;
  userId: string;
  username: string | null;
  reasonCode: WordReportReasonCode;
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
  imageId?: string | null;
  userId: string;
  reasonCode: WordReportReasonCode;
  note: string | null;
}

export interface WordReportListFilter {
  status?: WordReportStatus;
  limit: number;
  cursor?: string;
}

/** Alasan yang boleh dipakai untuk takedown kata (bukan laporan foto). */
export type { TakedownReasonCode };
