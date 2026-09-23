/** Whitelist id provider KBBI (query ?provider= + env KBBI_PROVIDER). */
export const KBBI_PROVIDER_IDS = ['raf555'] as const;
export type KbbiProviderId = (typeof KBBI_PROVIDER_IDS)[number];
