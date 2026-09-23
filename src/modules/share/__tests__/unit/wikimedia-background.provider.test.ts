import { describe, expect, it } from 'vitest';
import {
  artistFromExtmetadata,
  mapWikimediaPhoto,
  mapWikimediaVideo,
  stripHtml,
} from '../../infrastructure/wikimedia-background.provider';

describe('stripHtml', () => {
  it('buang tag artist Commons', () => {
    expect(stripHtml('<b>Ada Lovelace</b>')).toBe('Ada Lovelace');
  });
});

describe('artistFromExtmetadata', () => {
  it('ambil Artist.value', () => {
    expect(
      artistFromExtmetadata({
        Artist: { value: '<a href="/wiki/Ada">Ada</a>' },
      }),
    ).toBe('Ada');
  });
});

describe('mapWikimediaPhoto', () => {
  it('map imageinfo ke item foto', () => {
    const item = mapWikimediaPhoto({
      pageid: 99,
      title: 'File:Makan.jpg',
      imageinfo: [
        {
          url: 'https://upload.wikimedia.org/makan-full.jpg',
          thumburl: 'https://upload.wikimedia.org/makan-1280.jpg',
          thumbwidth: 1280,
          thumbheight: 1920,
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Makan.jpg',
          extmetadata: { Artist: { value: 'Ada' } },
        },
      ],
    });
    expect(item).toMatchObject({
      id: 'wikimedia-photo-99',
      kind: 'photo',
      provider: 'wikimedia',
      url: 'https://upload.wikimedia.org/makan-1280.jpg',
      photographer: 'Ada',
    });
  });
});

describe('mapWikimediaVideo', () => {
  it('map MP4 3-20 detik', () => {
    const item = mapWikimediaVideo({
      pageid: 7,
      title: 'File:Clip.mp4',
      imageinfo: [
        {
          url: 'https://upload.wikimedia.org/clip.mp4',
          thumburl: 'https://upload.wikimedia.org/clip.jpg',
          mime: 'video/mp4',
          duration: 12,
          width: 1920,
          height: 1080,
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Clip.mp4',
          extmetadata: { Artist: { value: 'Jane' } },
        },
      ],
    });
    expect(item).toMatchObject({
      id: 'wikimedia-video-7',
      kind: 'video',
      provider: 'wikimedia',
      url: 'https://upload.wikimedia.org/clip.mp4',
      duration_seconds: 12,
      mime_type: 'video/mp4',
    });
  });

  it('tolak webm dan durasi di luar rentang', () => {
    expect(
      mapWikimediaVideo({
        pageid: 1,
        imageinfo: [{ url: 'https://x.webm', mime: 'video/webm', duration: 10 }],
      }),
    ).toBeNull();
    expect(
      mapWikimediaVideo({
        pageid: 2,
        imageinfo: [{ url: 'https://x.mp4', mime: 'video/mp4', duration: 2 }],
      }),
    ).toBeNull();
  });
});
