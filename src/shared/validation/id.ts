import { z } from 'zod';

/**
 * ID yang dipilih user dari daftar (kelas kata, bahasa, dll).
 * Pesan field-specific, Bahasa Indonesia, tanpa jargon ULID.
 */
export function choiceId(label: string) {
  return z
    .string({ error: `${label} wajib dipilih` })
    .trim()
    .min(1, `${label} wajib dipilih`)
    .length(26, `${label} tidak valid. Pilih ulang dari daftar.`);
}

/**
 * ID opaque (path param, cursor, FK internal).
 * Tetap 26 karakter, tapi pesan tidak menyebut ULID.
 */
export const opaqueId = z
  .string({ error: 'Data tidak lengkap' })
  .length(26, 'Data tidak valid. Muat ulang halaman, lalu coba lagi.');
