// Port penyimpanan gambar — provider-agnostic (base-stack.md Section 8).
// Kode hanya bergantung pada interface ini; ganti provider (Cloudinary,
// S3+CloudFront, dst) = tulis implementasi baru di infrastructure/ saja.
export interface UploadCredentials {
  /** parameter yang dikirim client ke upload endpoint provider */
  token: string;
  signature: string;
  expire: number; // epoch detik
  public_key: string;
  upload_endpoint: string;
}

export interface ImageStoragePort {
  /** identitas provider — dicatat ke word_images.provider (bukan hardcode) */
  readonly providerName: string;
  /**
   * Kredensial untuk DIRECT UPLOAD dari client (pola ImageKit:
   * client upload langsung ke CDN, backend hanya menandatangani).
   * @param folder path folder tujuan, mis. `/words`
   */
  createUploadCredentials(folder: string): Promise<UploadCredentials>;
  /** hapus file di provider — dipakai saat word/image dihapus */
  deleteFile(providerFileId: string): Promise<void>;
}
