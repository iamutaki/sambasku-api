import { createHmac, randomBytes } from 'node:crypto';
import { env } from '@/shared/config/env';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import type { ImageStoragePort, UploadCredentials } from '../application/ports/image-storage.port';

const UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload';
const TOKEN_TTL_SECONDS = 30 * 60;

// Implementasi ImageKit dari ImageStoragePort — SATU-SATUNYA file yang
// tahu ImageKit. Ganti provider = file baru (mis. s3-storage.service.ts)
// + satu baris di composition root.
export class ImageKitStorageService implements ImageStoragePort {
  readonly providerName = 'imagekit';

  // Cek konfigurasi saat REQUEST, bukan saat wiring — app tetap bisa boot
  // walau provider belum diset (endpoint membalas 503)
  private assertConfigured(): { privateKey: string; publicKey: string } {
    if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_PUBLIC_KEY) {
      throw new ServiceUnavailableError(
        'IMAGE_UPLOAD_UNAVAILABLE',
        'Penyimpanan gambar belum dikonfigurasi — isi IMAGEKIT_* di .env',
      );
    }
    return { privateKey: env.IMAGEKIT_PRIVATE_KEY, publicKey: env.IMAGEKIT_PUBLIC_KEY };
  }

  // ImageKit client-side upload: token bebas, signature = HMAC-SHA1
  // dari (token + expire) dengan private key — client membawa ketiganya.
  // folder dikirim CLIENT saat upload (param upload, bukan bagian signature
  // ImageKit) — param ini tetap ada demi kontrak port (provider lain
  // mungkin me-scope token per folder)
  async createUploadCredentials(_folder: string): Promise<UploadCredentials> {
    const { privateKey, publicKey } = this.assertConfigured();
    const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = randomBytes(16).toString('hex');
    const signature = createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex');

    return {
      token,
      signature,
      expire,
      public_key: publicKey,
      upload_endpoint: UPLOAD_ENDPOINT,
    };
  }

  async deleteFile(providerFileId: string): Promise<void> {
    // Best-effort: file yatim di CDN tidak fatal — log saja (pola audit record)
    try {
      const { privateKey } = this.assertConfigured();
      const res = await fetch(`https://api.imagekit.io/v1/files/${providerFileId}`, {
        method: 'DELETE',
        headers: {
          authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`,
        },
      });
      if (!res.ok) {
        logger.warn({ provider_file_id: providerFileId, status: res.status }, 'ImageKit delete gagal');
      }
    } catch (err) {
      logger.warn({ err, provider_file_id: providerFileId }, 'ImageKit delete error');
    }
  }
}
