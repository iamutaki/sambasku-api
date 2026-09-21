import { describe, expect, it } from 'vitest';
import {
  mapPexelsVideo,
  pickPexelsVideoFile,
} from '../../infrastructure/pexels-background.provider';

describe('pickPexelsVideoFile', () => {
  it('pilih mp4 hd terdekat 1080', () => {
    const picked = pickPexelsVideoFile([
      {
        file_type: 'video/mp4',
        quality: 'sd',
        width: 640,
        height: 360,
        link: 'https://example.com/sd.mp4',
      },
      {
        file_type: 'video/mp4',
        quality: 'hd',
        width: 1920,
        height: 1080,
        link: 'https://example.com/hd.mp4',
      },
      {
        file_type: 'video/hls',
        quality: 'hd',
        width: 1920,
        height: 1080,
        link: 'https://example.com/hd.m3u8',
      },
    ]);
    expect(picked?.link).toBe('https://example.com/hd.mp4');
    expect(picked?.width).toBe(1920);
  });
});

describe('mapPexelsVideo', () => {
  it('map video_files ke item kind video', () => {
    const item = mapPexelsVideo({
      id: 2491284,
      duration: 12.4,
      image: 'https://images.pexels.com/videos/poster.jpg',
      url: 'https://www.pexels.com/video/2491284/',
      user: { name: 'Jane Doe', url: 'https://www.pexels.com/@jane' },
      video_files: [
        {
          file_type: 'video/mp4',
          quality: 'hd',
          width: 1080,
          height: 1920,
          link: 'https://example.com/v.mp4',
        },
      ],
    });
    expect(item).toMatchObject({
      id: 'pexels-video-2491284',
      kind: 'video',
      provider: 'pexels',
      url: 'https://example.com/v.mp4',
      preview_url: 'https://images.pexels.com/videos/poster.jpg',
      duration_seconds: 12,
      mime_type: 'video/mp4',
      photographer: 'Jane Doe',
    });
  });
});
