export interface Meaning {
  id: string;
  wordId: string;
  wordClassId: string | null;
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
    sourceLanguageId: string;
    sourceSentence: string;
    targetLanguageId: string | null;
    targetSentence: string | null;
    sourceType: string | null;
  }[];
}
