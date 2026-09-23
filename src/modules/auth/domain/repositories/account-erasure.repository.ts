export interface AccountErasureArtifacts {
  avatar: { path: string; sha: string } | null;
  /** File ImageKit (laporan bug, lampiran pengajuan verifikator). */
  privateFileIds: string[];
}

/**
 * Menghapus data pribadi yang terikat akun dan menandai user terhapus.
 * Baris `users` tetap ada supaya entri kamus yang mereferensinya tidak rusak.
 */
export interface AccountErasureRepository {
  erase(userId: string): Promise<AccountErasureArtifacts>;
}
