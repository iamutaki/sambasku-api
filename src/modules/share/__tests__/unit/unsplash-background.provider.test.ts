import { describe, expect, it } from 'vitest';
import { buildUnsplashSearchUrl } from '../../infrastructure/unsplash-background.provider';

describe('buildUnsplashSearchUrl', () => {
  it('selalu content_filter=high', () => {
    const url = buildUnsplashSearchUrl('makan', 1, '12', 'portrait');
    expect(url.searchParams.get('content_filter')).toBe('high');
    expect(url.searchParams.get('query')).toBe('makan');
  });
});
