import { describe, expect, it } from 'vitest';
import { mapOpenversePhoto } from '../../infrastructure/openverse-background.provider';

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

  it('tolak tanpa url', () => {
    expect(mapOpenversePhoto({ id: 'x', creator: 'Ada' })).toBeNull();
  });
});
