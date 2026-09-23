import { env } from '@/shared/config/env';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import type { ImageStoragePort, UploadCredentials } from '../application/ports/image-storage.port';

const UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload';
const TOKEN_TTL_SECONDS = 30 * 60;

// Web Crypto (crypto.subtle / getRandomValues) - jalan sama di Node 18+
// dan Cloudflare Workers, tanpa node:crypto/Buffer. Algoritma tidak berubah:
// signature = HMAC-SHA1(token + expire) dengan private key.
async function hmacSha1Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

function basicAuth(user: string): string {
  // Basic auth = base64("privateKey:") - tanpa Buffer, pakai btoa (standar web)
  return `Basic ${btoa(`${user}:`)}`;
}

// Implementasi ImageKit dari ImageStoragePort - SATU-SATUNYA file yang
// tahu ImageKit. Ganti provider = file baru (mis. s3-storage.service.ts)
// + satu baris di composition root.
export class ImageKitStorageService implements ImageStoragePort {
  readonly providerName = 'imagekit';

  // Cek konfigurasi saat REQUEST, bukan saat wiring - app tetap bisa boot
  // walau provider belum diset (endpoint membalas 503)
  private assertConfigured(): { privateKey: string; publicKey: string } {
    if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_PUBLIC_KEY) {
      throw new ServiceUnavailableError(
        'IMAGE_UPLOAD_UNAVAILABLE',
        'Penyimpanan gambar belum dikonfigurasi - isi IMAGEKIT_* di .env',
      );
    }
    return { privateKey: env.IMAGEKIT_PRIVATE_KEY, publicKey: env.IMAGEKIT_PUBLIC_KEY };
  }

  // ImageKit client-side upload: token bebas, signature = HMAC-SHA1
  // dari (token + expire) dengan private key - client membawa ketiganya.
  // folder dikirim CLIENT saat upload (param upload, bukan bagian signature
  // ImageKit) - param ini tetap ada demi kontrak port (provider lain
  // mungkin me-scope token per folder)
  async createUploadCredentials(_folder: string): Promise<UploadCredentials> {
    const { privateKey, publicKey } = this.assertConfigured();
    const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = randomToken(16);
    const signature = await hmacSha1Hex(privateKey, token + expire);

    return {
      token,
      signature,
      expire,
      public_key: publicKey,
      upload_endpoint: UPLOAD_ENDPOINT,
    };
  }

  async deleteFile(providerFileId: string): Promise<void> {
    // Best-effort: file yatim di CDN tidak fatal - log saja (pola audit record)
    try {
      const { privateKey } = this.assertConfigured();
      const res = await fetch(`https://api.imagekit.io/v1/files/${providerFileId}`, {
        method: 'DELETE',
        headers: { authorization: basicAuth(privateKey) },
      });
      if (!res.ok) {
        logger.warn({ provider_file_id: providerFileId, status: res.status }, 'ImageKit delete gagal');
      }
    } catch (err) {
      logger.warn({ err, provider_file_id: providerFileId }, 'ImageKit delete error');
    }
  }
}
