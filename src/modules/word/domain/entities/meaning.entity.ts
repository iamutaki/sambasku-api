import type { WordClassSummary } from './word.entity';

export interface Meaning {
  id: string;
  wordId: string;
  /** kelas kata tersemat (Nomina/Verba/…) - null kalau makna tanpa kelas */
  wordClass: WordClassSummary | null;
  /** 04: provenance makna hasil SALINAN sinonim inline - null = mandiri/
   *  di-override; terisi = masih "mengikuti" makna induk */
  inheritedFromMeaningId: string | null;
  definition: string;
  /** 17-api-usul-definisi.md: false = placeholder "-" (belum ada definisi) */
  isHaveDefinition: boolean;
  /** false = tanpa padanan kata Indonesia */
  isHaveTranslation: boolean;
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
    /** Audio pelafalan kalimat contoh (word_audios.example_id = id ini) */
    audios?: {
      id: string;
      url: string;
      dialectId: string | null;
      speakerName: string | null;
      durationMs: number | null;
      isPrimary: boolean;
      mimeType: string;
      status?: import('./word.entity').ChildStatus;
      isVerified?: boolean;
      isCorrected?: boolean;
    }[];
    /** terisi saat includeAllStatuses (layar review); publik selalu published */
    status?: import('./word.entity').ChildStatus;
    isVerified?: boolean;
    isCorrected?: boolean;
  }[];
}

/** 17-api-usul-definisi.md: hasil POST /words/:wordId/meanings (per role). */
export interface MeaningMedia {
  id: string;
  wordId: string;
  wordClassId: string | null;
  definition: string;
  orderIndex: number;
  status: import('./word.entity').ChildStatus;
  isVerified: boolean;
  isCorrected: boolean;
}
