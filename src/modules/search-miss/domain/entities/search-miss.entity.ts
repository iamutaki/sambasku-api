// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
// (03-api-kontribusi-verifikasi.md - pencarian kosong jadi peluang kontribusi)
// + 14-api: isVisible gate beranda

export type SearchMissDirection = 'lemma' | 'translation';

export interface SearchMiss {
  id: string;
  term: string;
  direction: SearchMissDirection;
  hitCount: number;
  lastSearchedAt: Date;
  /**
   * DERIVED (tidak disimpan): true kalau sudah ada kata published yang
   * menjawab term - lemma match (direction lemma) atau translation text
   * match (direction translation). Lihat 12-api §4.
   */
  isFulfilled: boolean;
  /** Gate beranda (14-api). Default false untuk miss baru. */
  isVisible: boolean;
  createdAt: Date;
}
