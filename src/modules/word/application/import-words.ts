import type { WordStatus } from '../domain/entities/word.entity';

export interface ImportMeaningInput {
  translation?: string;
  definition?: string;
  example?: string;
}

export interface ImportWordInput {
  lemma: string;
  verify: boolean;
  notes?: string;
  meanings: ImportMeaningInput[];
}

export type ImportOutcome = 'created' | 'meanings_added' | 'skipped' | 'invalid';

export interface ImportWordResult {
  lemma: string;
  outcome: ImportOutcome;
  status?: 'draft' | 'published';
  is_verified?: boolean;
  meanings_added: number;
  meanings_skipped: number;
  message?: string;
}

const VERIFIER_ROLES = new Set(['admin', 'root', 'reviewer']);

export function canVerifyImport(role: string): boolean {
  return VERIFIER_ROLES.has(role);
}

/** Sidik makna: definisi dan padanan yang memang diisi, huruf kecil. */
export function meaningFingerprint(input: {
  definition?: string;
  translation?: string;
  isHaveDefinition?: boolean;
  isHaveTranslation?: boolean;
}): string {
  const hasDef = input.isHaveDefinition ?? !!input.definition?.trim();
  const hasTr = input.isHaveTranslation ?? !!input.translation?.trim();
  const definition = hasDef ? (input.definition ?? '').trim().toLowerCase() : '';
  const translation = hasTr ? (input.translation ?? '').trim().toLowerCase() : '';
  return `${definition}\n${translation}`;
}

export function normalizeLemma(lemma: string): string {
  return lemma.trim().toLowerCase();
}

/**
 * Kata baru: centang verifikasi + role verifikator → tayang.
 * Selain itu draf. Makna pada induk yang belum tayang selalu draf.
 */
export function decideImportPublication(input: {
  verify: boolean;
  role: string;
  parentStatus: WordStatus | null;
}): { status: 'draft' | 'published'; isVerified: boolean; forcedDraft: boolean } {
  const parentBlocks =
    input.parentStatus !== null && input.parentStatus !== 'published';
  if (parentBlocks || !input.verify || !canVerifyImport(input.role)) {
    return { status: 'draft', isVerified: false, forcedDraft: parentBlocks };
  }
  return { status: 'published', isVerified: true, forcedDraft: false };
}

export function preparedMeaning(input: ImportMeaningInput): {
  definition: string;
  translation: string;
  example: string;
  isHaveDefinition: boolean;
  isHaveTranslation: boolean;
} | null {
  const translation = input.translation?.trim() ?? '';
  const definition = input.definition?.trim() ?? '';
  const example = input.example?.trim() ?? '';
  if (!translation && !definition) return null;
  return {
    definition: definition || '-',
    translation,
    example,
    isHaveDefinition: definition.length > 0,
    isHaveTranslation: translation.length > 0,
  };
}
