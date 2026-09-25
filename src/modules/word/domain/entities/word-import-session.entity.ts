export type WordImportSessionStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export type WordImportSessionItem = {
  lemma: string;
  outcome: 'created' | 'meanings_added' | 'skipped' | 'invalid';
  meanings_added: number;
  message?: string;
};

export type WordImportSession = {
  id: string;
  triggeredBy: string;
  triggeredByUsername: string | null;
  attributedTo: string;
  attributedToUsername: string | null;
  sourceLabel: string | null;
  status: WordImportSessionStatus;
  total: number;
  createdCount: number;
  duplicatesCount: number;
  meaningsAddedCount: number;
  invalidCount: number;
  items: WordImportSessionItem[];
  createdAt: Date;
  finishedAt: Date | null;
};

export type NewWordImportSession = {
  id: string;
  triggeredBy: string;
  attributedTo: string;
  sourceLabel?: string | null;
  status: WordImportSessionStatus;
  total: number;
  createdCount: number;
  duplicatesCount: number;
  meaningsAddedCount: number;
  invalidCount: number;
  items: WordImportSessionItem[];
  finishedAt?: Date | null;
};
