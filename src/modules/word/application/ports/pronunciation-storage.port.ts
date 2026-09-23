// Port penyimpanan file audio pronunciation - provider-agnostic.
// Upload lewat backend-mediated (bukan direct-upload seperti ImageKit):
// client → multipart ke API → API upload ke storage → simpan URL di DB.
// Berbeda dari ImageStoragePort yang memakai direct-upload.
export interface PronunciationStoragePort {
  /** Nama provider - disimpan ke kolom `provider` di word_audios */
  readonly providerName: string;

  /**
   * Upload file audio ke storage. Mengembalikan metadata file setelah upload.
   * @param input.path  - path tujuan di storage, mis. 'assets/audio/sambas/kong/01J8ZQ….m4a'
   * @param input.content - isi file sebagai Uint8Array
   * @param input.mimeType - MIME type file, mis. 'audio/mp4'
   */
  upload(input: {
    path: string;
    content: Uint8Array;
    mimeType: string;
  }): Promise<{ path: string; url: string; sha: string; size: number }>;

  /**
   * Hapus file dari storage. Dipanggil saat soft-delete audio.
   * Gagal → log warning, jangan lempar (file yatim acceptable).
   * @param path - path file di storage
   * @param sha  - blob sha (dipakai GitHub Contents API DELETE)
   */
  delete(path: string, sha: string): Promise<void>;
}
