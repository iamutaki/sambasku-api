// Port penyimpanan gambar publik (kata + avatar) — backend-mediated.
// Beda dari ImageStoragePort (direct-upload ImageKit untuk laporan/verifikator).
export interface PublicImageStoragePort {
  /** Nama provider - disimpan ke word_images.provider / users.avatar_provider */
  readonly providerName: string;

  upload(input: {
    path: string;
    content: Uint8Array;
    mimeType: string;
  }): Promise<{ path: string; url: string; sha: string; size: number }>;

  /** Best-effort: gagal → log, jangan lempar. */
  delete(path: string, sha: string): Promise<void>;
}
