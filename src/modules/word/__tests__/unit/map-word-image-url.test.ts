import { describe, expect, it } from 'vitest';
import { PENDING_WORD_IMAGE_PLACEHOLDER_URL } from '@/shared/constants/pending-word-image';
import { mapPublicWordImageUrl } from '../../presentation/v1/map-word-image-url';

describe('mapPublicWordImageUrl', () => {
  it('redact staging ImageKit belum diverifikasi', () => {
    const mapped = mapPublicWordImageUrl(
      {
        url: 'https://ik.imagekit.io/x/a.jpg',
        provider: 'imagekit',
        isVerified: false,
        providerFileId: 'file_1',
      },
      { redactStaging: true },
    );
    expect(mapped.url).toBe(PENDING_WORD_IMAGE_PLACEHOLDER_URL);
    expect(mapped.providerFileId).toBe('');
  });

  it('tidak redact jika verified / stock / admin', () => {
    expect(
      mapPublicWordImageUrl(
        {
          url: 'https://ik.imagekit.io/x/a.jpg',
          provider: 'imagekit',
          isVerified: true,
          providerFileId: 'file_1',
        },
        { redactStaging: true },
      ).url,
    ).toBe('https://ik.imagekit.io/x/a.jpg');

    expect(
      mapPublicWordImageUrl(
        {
          url: 'https://images.pexels.com/a.jpg',
          provider: 'pexels',
          isVerified: false,
          providerFileId: 'p1',
        },
        { redactStaging: true },
      ).url,
    ).toBe('https://images.pexels.com/a.jpg');

    expect(
      mapPublicWordImageUrl(
        {
          url: 'https://ik.imagekit.io/x/a.jpg',
          provider: 'imagekit',
          isVerified: false,
          providerFileId: 'file_1',
        },
        { redactStaging: false },
      ).providerFileId,
    ).toBe('file_1');
  });
});
