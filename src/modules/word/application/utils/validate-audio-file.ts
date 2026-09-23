import { BadRequestError } from '@/shared/errors/app-error';
import { extensionForMime } from './pronunciation-audio-path';

export const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
]);

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ValidatedAudioFile {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
  filename: string | null;
}

function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  // ID3 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // Frame sync 0xFFEx
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function looksLikeM4a(bytes: Uint8Array): boolean {
  // ....ftyp
  if (bytes.length < 8) return false;
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function looksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const wave =
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  return riff && wave;
}

function looksLikeOgg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  );
}

function looksLikeWebm(bytes: Uint8Array): boolean {
  // EBML header
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

function magicOk(mime: string, bytes: Uint8Array): boolean {
  switch (mime) {
    case 'audio/mpeg':
      return looksLikeMp3(bytes);
    case 'audio/mp4':
      return looksLikeM4a(bytes);
    case 'audio/wav':
    case 'audio/x-wav':
      return looksLikeWav(bytes);
    case 'audio/ogg':
      return looksLikeOgg(bytes);
    case 'audio/webm':
      return looksLikeWebm(bytes);
    default:
      return false;
  }
}

/**
 * Validasi file audio dari multipart.
 * Tolak: kosong, >5MB, MIME tak dikenal, path traversal di filename, magic mismatch.
 */
export function validateAudioFile(input: {
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  filename?: string | null;
}): ValidatedAudioFile {
  const filename = input.filename?.trim() || null;
  if (filename && (filename.includes('..') || filename.includes('\0'))) {
    throw new BadRequestError('INVALID_AUDIO_FILENAME', 'Nama file audio tidak valid', [
      { field: 'audio', message: 'Nama file mengandung karakter terlarang' },
    ]);
  }

  const mime = (input.mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (!mime || !ALLOWED_AUDIO_MIMES.has(mime)) {
    throw new BadRequestError('INVALID_AUDIO_MIME', 'Format audio tidak didukung', [
      {
        field: 'audio',
        message: 'MIME harus audio/mpeg, audio/mp4, audio/wav, audio/ogg, atau audio/webm',
      },
    ]);
  }

  if (!extensionForMime(mime)) {
    throw new BadRequestError('INVALID_AUDIO_MIME', 'Format audio tidak didukung', [
      { field: 'audio', message: 'Ekstensi tidak bisa diturunkan dari MIME' },
    ]);
  }

  const { bytes } = input;
  if (bytes.byteLength === 0) {
    throw new BadRequestError('EMPTY_AUDIO_FILE', 'File audio kosong', [
      { field: 'audio', message: 'File tidak boleh 0 byte' },
    ]);
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new BadRequestError('AUDIO_TOO_LARGE', 'File audio terlalu besar (maks 5 MB)', [
      { field: 'audio', message: 'Ukuran maksimal 5 MB' },
    ]);
  }

  if (!magicOk(mime, bytes)) {
    throw new BadRequestError(
      'INVALID_AUDIO_CONTENT',
      'Isi file tidak cocok dengan format audio yang diklaim',
      [{ field: 'audio', message: 'Magic-byte tidak cocok dengan MIME' }],
    );
  }

  return { bytes, mimeType: mime === 'audio/x-wav' ? 'audio/wav' : mime, size: bytes.byteLength, filename };
}

/** Clamp duration_ms opsional dari client (1..600_000). */
export function clampDurationMs(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 600_000) return null;
  return i;
}
