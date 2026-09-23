/** Teks publik untuk akun yang sudah dihapus. Bukan username yang bisa dibuka. */
export const DELETED_ACCOUNT_LABEL = 'Akun tidak ditemukan';

export function publicAccountName(
  username: string | null | undefined,
  deletedAt: Date | null | undefined,
): string | null {
  if (!username) return null;
  if (deletedAt) return DELETED_ACCOUNT_LABEL;
  return username;
}
