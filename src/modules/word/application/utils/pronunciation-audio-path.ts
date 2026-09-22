import { generateId } from '@/shared/utils/ulid';

const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

/** Slug lemma untuk path kosmetik (human-browsable). */
export function slugifyLemma(lemma: string): string {
  const s = lemma
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'lemma';
}

export function extensionForMime(mimeType: string): string | null {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? null;
}

/**
 * Path immutable per upload:
 * assets/audio/<dialect|umum>/<lemma-slug>/<ulid>.<ext>
 */
export function buildPronunciationAudioPath(input: {
  dialectCode?: string | null;
  lemma: string;
  mimeType: string;
  id?: string;
}): string {
  const ext = extensionForMime(input.mimeType);
  if (!ext) {
    throw new Error(`MIME tidak punya ekstensi: ${input.mimeType}`);
  }
  const dialect = (input.dialectCode?.trim() || 'umum').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const slug = slugifyLemma(input.lemma);
  const id = input.id ?? generateId();
  return `assets/audio/${dialect || 'umum'}/${slug}/${id}.${ext}`;
}
