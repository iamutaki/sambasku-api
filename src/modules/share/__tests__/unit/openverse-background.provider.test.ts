import { describe, expect, it } from 'vitest';
import {
  OPENVERSE_SAFE_LICENSES,
  buildOpenverseSearchUrl,
  mapOpenversePhoto,
} from '../../infrastructure/openverse-background.provider';

describe('buildOpenverseSearchUrl', () => {
  it('selalu mature=false + license CC + tanpa sensitive', () => {
    const url = buildOpenverseSearchUrl('makan', 1, '12');
    expect(url.searchParams.get('mature')).toBe('false');
    expect(url.searchParams.get('license')).toBe(OPENVERSE_SAFE_LICENSES);
    expect(url.searchParams.get('unstable__include_sensitive_results')).toBe(
      'false',
    );
  });
});

describe('mapOpenversePhoto', () => {
  it('map url + creator ke item foto', () => {
    const item = mapOpenversePhoto({
      id: 'abc-1',
      url: 'https://example.com/a.jpg',
      thumbnail: 'https://example.com/a-thumb.jpg',
      creator: 'Ada',
      foreign_landing_url: 'https://openverse.org/image/abc-1',
      width: 1080,
      height: 1620,
      mature: false,
      unstable__sensitivity: [],
    });
    expect(item).toMatchObject({
      id: 'openverse-photo-abc-1',
      kind: 'photo',
      provider: 'openverse',
      url: 'https://example.com/a.jpg',
      preview_url: 'https://example.com/a-thumb.jpg',
      photographer: 'Ada',
    });
  });

  it('tolak mature atau sensitive', () => {
    expect(
      mapOpenversePhoto({
        id: 'x',
        url: 'https://example.com/a.jpg',
        creator: 'Ada',
        mature: true,
      }),
    ).toBeNull();
    expect(
      mapOpenversePhoto({
        id: 'y',
        url: 'https://example.com/a.jpg',
        creator: 'Ada',
        unstable__sensitivity: ['sensitive'],
      }),
    ).toBeNull();
  });

  it('tolak tanpa url', () => {
    expect(mapOpenversePhoto({ id: 'x', creator: 'Ada' })).toBeNull();
  });
});
