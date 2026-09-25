/**
 * Provider gambar kata: upload storage aktif (github/imagekit) ATAU stock
 * Media Explorer (pexels/…). Client boleh kirim provider stock atau imagekit
 * (staging kontributor); absen/github → diisi dari storage aktif di presentation.
 */

export const STOCK_WORD_IMAGE_PROVIDERS = [
  'pexels',
  'pixabay',
  'openverse',
  'wikimedia',
  'unsplash',
] as const;

export type StockWordImageProvider = (typeof STOCK_WORD_IMAGE_PROVIDERS)[number];

/** Host yang boleh untuk URL stock (suffix match, case-insensitive). */
const STOCK_URL_HOST_SUFFIXES: Record<StockWordImageProvider, readonly string[] | 'any-https'> = {
  pexels: ['images.pexels.com'],
  pixabay: ['cdn.pixabay.com', 'pixabay.com'],
  unsplash: ['images.unsplash.com', 'plus.unsplash.com'],
  wikimedia: ['upload.wikimedia.org'],
  // Openverse mengagregasi banyak sumber — izinkan HTTPS apa saja.
  openverse: 'any-https',
};

export function isStockWordImageProvider(value: string): value is StockWordImageProvider {
  return (STOCK_WORD_IMAGE_PROVIDERS as readonly string[]).includes(value);
}

export function isAllowedStockImageUrl(provider: StockWordImageProvider, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const hosts = STOCK_URL_HOST_SUFFIXES[provider];
  if (hosts === 'any-https') return true;

  const hostname = parsed.hostname.toLowerCase();
  return hosts.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

/**
 * Resolve provider yang disimpan di DB.
 * Stock / imagekit staging dari client dipertahankan; selain itu pakai storage aktif.
 */
export function resolveWordImageProvider(
  clientProvider: string | undefined,
  activeStorageProvider: string,
): string {
  if (clientProvider && isStockWordImageProvider(clientProvider)) {
    return clientProvider;
  }
  if (clientProvider === 'imagekit') {
    return 'imagekit';
  }
  return activeStorageProvider;
}

/** Gambar stock / sudah di GitHub publik dianggap aman tanpa gate staging. */
export function wordImageIsAutoVerified(provider: string): boolean {
  return isStockWordImageProvider(provider) || provider === 'github';
}
