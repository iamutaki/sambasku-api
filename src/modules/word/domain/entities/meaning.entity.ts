import type { WordClassSummary } from './word.entity';

export interface Meaning {
  id: string;
  wordId: string;
  /** kelas kata tersemat (Nomina/Verba/…) — null kalau makna tanpa kelas */
  wordClass: WordClassSummary | null;
  definition: string;
  orderIndex: number;
  notes: string | null;
}

export interface MeaningDetail extends Meaning {
  translations: {
    languageId: string;
    translationText: string;
    translationType: string;
  }[];
  examples: {
    id: string;
    sourceLanguageId: string;
    sourceSentence: string;
    targetLanguageId: string | null;
    targetSentence: string | null;
    sourceType: string | null;
    /** terisi saat includeAllStatuses (layar review); publik selalu published */
    status?: import('./word.entity').ChildStatus;
    isVerified?: boolean;
    isCorrected?: boolean;
  }[];
}
