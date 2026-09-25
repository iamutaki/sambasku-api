/** Label register & peringatan konten pada kata (closed product enum). */
export const USAGE_LABELS = [
  'kasar',
  'tabu',
  'informal',
  'halus',
  'seksual',
  'diskriminatif',
] as const;

export type UsageLabel = (typeof USAGE_LABELS)[number];

/** Register: gaya/pantangan berbahasa. */
export const REGISTER_LABELS = ['kasar', 'tabu', 'informal', 'halus'] as const satisfies readonly UsageLabel[];

/** Peringatan: sensitivitas isi makna. */
export const WARNING_LABELS = ['seksual', 'diskriminatif'] as const satisfies readonly UsageLabel[];

/**
 * Label yang disembunyikan dari feed (Aktivitas terbaru) dan WOTD.
 * Detail/cari tetap boleh menampilkan kata + badge.
 */
export const FEED_EXCLUDED_USAGE_LABELS = [
  'kasar',
  'tabu',
  'seksual',
  'diskriminatif',
] as const satisfies readonly UsageLabel[];

/**
 * Label yang disembunyikan dari browsing A-Z publik (`GET /words` tanpa `q`).
 * Pencarian manual (`q` terisi, `/words/search`, detail by lemma) tetap boleh.
 */
export const BROWSE_EXCLUDED_USAGE_LABELS = [
  'kasar',
  'diskriminatif',
] as const satisfies readonly UsageLabel[];

export const USAGE_LABEL_SET = new Set<string>(USAGE_LABELS);

const FEED_EXCLUDED_SET = new Set<string>(FEED_EXCLUDED_USAGE_LABELS);
const BROWSE_EXCLUDED_SET = new Set<string>(BROWSE_EXCLUDED_USAGE_LABELS);

/** True jika kata tidak boleh muncul di feed / WOTD. */
export function hasFeedExcludedUsageLabels(labels: readonly string[] | null | undefined): boolean {
  if (!labels?.length) return false;
  return labels.some((l) => FEED_EXCLUDED_SET.has(l));
}

/** True jika kata tidak boleh muncul di daftar A-Z tanpa pencarian. */
export function hasBrowseExcludedUsageLabels(labels: readonly string[] | null | undefined): boolean {
  if (!labels?.length) return false;
  return labels.some((l) => BROWSE_EXCLUDED_SET.has(l));
}

/** `halus` dan `kasar` saling bertentangan. */
export function hasConflictingUsageLabels(labels: readonly string[]): boolean {
  return labels.includes('halus') && labels.includes('kasar');
}
