/** Disimpan lowercase; filter komentar juga case-insensitive. */
export const BLOCKLIST_WORD_MAX_LENGTH = 100;

export const BLOCKLIST_BULK_MAX = 2000;

export interface NormalizedBlocklistBatch {
  /** Unik, sudah trim + lowercase, siap disimpan. */
  words: string[];
  /** Kemunculan kedua dan seterusnya di batch yang sama. */
  duplicateInBatch: number;
  /** Lebih dari 100 karakter. Token kosong tidak dihitung. */
  invalidCount: number;
}

/**
 * Normalisasi batch sebelum cek duplikat di database.
 * Token kosong (koma ganda, spasi) dibuang diam-diam.
 */
export function normalizeBlocklistWords(inputs: string[]): NormalizedBlocklistBatch {
  const seen = new Set<string>();
  const words: string[] = [];
  let duplicateInBatch = 0;
  let invalidCount = 0;

  for (const raw of inputs) {
    const word = raw.trim().toLowerCase();
    if (!word) continue;
    if (word.length > BLOCKLIST_WORD_MAX_LENGTH) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(word)) {
      duplicateInBatch += 1;
      continue;
    }
    seen.add(word);
    words.push(word);
  }

  return { words, duplicateInBatch, invalidCount };
}
