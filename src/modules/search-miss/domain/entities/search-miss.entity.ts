// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
// (03-api-kontribusi-verifikasi.md - pencarian kosong jadi peluang kontribusi)

export type SearchMissDirection = 'lemma' | 'translation';

export interface SearchMiss {
  id: string;
  term: string;
  direction: SearchMissDirection;
  hitCount: number;
  lastSearchedAt: Date;
  /**
   * DERIVED (tidak disimpan): true kalau sudah ada kata published dengan
   * lemma = term (direction 'lemma'). Miss 'translation' tetap false sampai
   * diverifikasi manual - ponytail: derive via JOIN, tanpa kolom sinkron.
   */
  isFulfilled: boolean;
  createdAt: Date;
}
