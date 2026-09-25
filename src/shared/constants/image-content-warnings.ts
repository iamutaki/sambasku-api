/** Peringatan visual per foto kata (closed enum, menempel di word_images). */
export const IMAGE_CONTENT_WARNINGS = ['kekerasan'] as const;

export type ImageContentWarning = (typeof IMAGE_CONTENT_WARNINGS)[number];

export const IMAGE_CONTENT_WARNING_SET = new Set<string>(IMAGE_CONTENT_WARNINGS);

export function hasViolenceImageWarning(
  warnings: readonly string[] | null | undefined,
): boolean {
  return Boolean(warnings?.includes('kekerasan'));
}
