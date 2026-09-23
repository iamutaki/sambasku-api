import { generateId } from '@/shared/utils/ulid';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForImageMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? 'jpg';
}

/** Path kata: assets/words/<ulid>.<ext> — ULID sebelum kata tersimpan. */
export function buildWordImagePath(mimeType: string): string {
  return `assets/words/${generateId()}.${extensionForImageMime(mimeType)}`;
}

/** Path avatar: assets/avatars/<userId>/<ulid>.<ext> */
export function buildAvatarImagePath(userId: string, mimeType: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `assets/avatars/${safeUser}/${generateId()}.${extensionForImageMime(mimeType)}`;
}
