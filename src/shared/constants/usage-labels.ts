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

export const USAGE_LABEL_SET = new Set<string>(USAGE_LABELS);

/** `halus` dan `kasar` saling bertentangan. */
export function hasConflictingUsageLabels(labels: readonly string[]): boolean {
  return labels.includes('halus') && labels.includes('kasar');
}
