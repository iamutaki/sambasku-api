import { describe, expect, it } from 'vitest';
import {
  mapPixabayPhoto,
  mapPixabayVideo,
  pickPixabayVideoFile,
} from '../../infrastructure/pixabay-background.provider';

describe('pickPixabayVideoFile', () => {
  it('pilih large lalu medium', () => {
    const picked = pickPixabayVideoFile({
      large: { url: 'https://example.com/l.mp4', width: 1920, height: 1080 },
      medium: { url: 'https://example.com/m.mp4', width: 1280, height: 720 },
    });
    expect(picked?.url).toBe('https://example.com/l.mp4');
    expect(picked?.width).toBe(1920);
  });
});

describe('mapPixabayPhoto', () => {
  it('map largeImageURL ke item foto', () => {
    const item = mapPixabayPhoto({
      id: 42,
      largeImageURL: 'https://cdn.pixabay.com/photo/42.jpg',
      user: 'Ada',
      pageURL: 'https://pixabay.com/photos/42/',
      imageWidth: 1080,
      imageHeight: 1620,
    });
    expect(item).toMatchObject({
      id: 'pixabay-photo-42',
      kind: 'photo',
      provider: 'pixabay',
      url: 'https://cdn.pixabay.com/photo/42.jpg',
      photographer: 'Ada',
    });
  });
});

describe('mapPixabayVideo', () => {
  it('map videos.large ke item kind video', () => {
    const item = mapPixabayVideo({
      id: 125,
      duration: 12,
      pageURL: 'https://pixabay.com/videos/id-125/',
      user: 'Jane',
      picture_id: 'abc',
      videos: {
        large: {
          url: 'https://example.com/v.mp4',
          width: 1920,
          height: 1080,
          thumbnail: 'https://example.com/t.jpg',
        },
      },
    });
    expect(item).toMatchObject({
      id: 'pixabay-video-125',
      kind: 'video',
      provider: 'pixabay',
      url: 'https://example.com/v.mp4',
      preview_url: 'https://example.com/t.jpg',
      duration_seconds: 12,
      mime_type: 'video/mp4',
    });
  });

  it('tolak video di luar 3-20 detik', () => {
    expect(
      mapPixabayVideo({
        id: 1,
        duration: 2,
        user: 'Jane',
        pageURL: 'https://pixabay.com/videos/1/',
        videos: { large: { url: 'https://example.com/v.mp4', width: 1, height: 1 } },
      }),
    ).toBeNull();
  });
});
