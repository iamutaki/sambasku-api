import { BadRequestError } from '@/shared/errors/app-error';
import { extensionForImageMime } from './public-image-path';

export const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ValidatedImageFile {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
  filename: string | null;
}

function normalizeMime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw.split(';')[0].trim().toLowerCase();
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}

function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function looksLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function looksLikeWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return riff && webp;
}

function magicOk(mime: string, bytes: Uint8Array): boolean {
  switch (mime) {
    case 'image/jpeg':
      return looksLikeJpeg(bytes);
    case 'image/png':
      return looksLikePng(bytes);
    case 'image/webp':
      return looksLikeWebp(bytes);
    default:
      return false;
  }
}

export function validateImageFile(input: {
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  filename?: string | null;
}): ValidatedImageFile {
  const filename = input.filename?.trim() || null;
  if (filename && (filename.includes('..') || filename.includes('\0'))) {
    throw new BadRequestError('VALIDATION_ERROR', 'Nama file tidak valid', [
      { field: 'file', message: 'Nama file tidak valid' },
    ]);
  }

  if (input.bytes.byteLength === 0) {
    throw new BadRequestError('VALIDATION_ERROR', 'File gambar kosong', [
      { field: 'file', message: 'File tidak boleh kosong' },
    ]);
  }

  if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new BadRequestError('IMAGE_TOO_LARGE', 'File gambar terlalu besar (maks 5 MB)', [
      { field: 'file', message: 'Ukuran maksimal 5 MB' },
    ]);
  }

  const mime = normalizeMime(input.mimeType);
  if (!mime || !ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new BadRequestError('VALIDATION_ERROR', 'Format gambar tidak didukung', [
      { field: 'file', message: 'Hanya jpg, png, atau webp' },
    ]);
  }

  if (!magicOk(mime, input.bytes)) {
    throw new BadRequestError('VALIDATION_ERROR', 'Isi file tidak cocok dengan format gambar', [
      { field: 'file', message: 'File rusak atau bukan gambar yang diizinkan' },
    ]);
  }

  // Pastikan ekstensi dari MIME tersedia (path generator)
  void extensionForImageMime(mime);

  return {
    bytes: input.bytes,
    mimeType: mime,
    size: input.bytes.byteLength,
    filename,
  };
}
