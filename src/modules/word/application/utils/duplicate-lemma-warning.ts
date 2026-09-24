/** Copy peringatan lemma duplikat - ditampilkan toast console dari warnings[].message. */

/** Entri baru belum tayang; gabung otomatis jalan saat publish. */
export const DUPLICATE_LEMMA_PENDING_MERGE =
  'Lemma ini sudah ada. Saat ditayangkan, makna digabung otomatis ke entri yang sudah tayang.';

/** Entri baru langsung tayang dan sudah digabung ke kembaran published. */
export const DUPLICATE_LEMMA_MERGED_NOW =
  'Lemma ini sudah ada. Makna baru digabung otomatis ke entri yang sudah tayang.';

/**
 * Entri sudah tayang tetapi tidak ada kembaran published untuk digabung
 * (mis. kembaran masih draf) — bersihkan lewat tab Duplikasi.
 */
export const DUPLICATE_LEMMA_USE_TAB =
  'Lemma ini sudah ada dan entri ini sudah tayang. Selesaikan di tab Duplikasi.';
