import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteProposedStagingImages,
  prepareProposedImagesForApprove,
} from '../../application/utils/suggestion-image-moderation';
import type { ProposedChanges } from '../../domain/entities/word-suggestion.entity';
import {
  deleteStagingWordImage,
  promoteWordImageFromStaging,
} from '@/modules/contribution/application/utils/promote-word-image-staging';

vi.mock('@/modules/contribution/application/utils/promote-word-image-staging', () => ({
  promoteWordImageFromStaging: vi.fn().mockResolvedValue({
    url: 'https://cdn.jsdelivr.net/gh/sambasku/images/assets/words/a.jpg',
    provider: 'github',
    providerFileId: 'assets/words/a.jpg',
    sha: 'abc',
  }),
  deleteStagingWordImage: vi.fn().mockResolvedValue(undefined),
}));

const publicImageStorage = {} as never;
const imageStorage = {} as never;

describe('suggestion-image-moderation', () => {
  beforeEach(() => {
    vi.mocked(promoteWordImageFromStaging).mockClear();
    vi.mocked(deleteStagingWordImage).mockClear();
  });

  it('promote ImageKit yang ditayangkan; skip yang ditolak', async () => {
    const changes: ProposedChanges = {
      images: [
        {
          action: 'add',
          url: 'https://ik.imagekit.io/x/a.jpg',
          provider: 'imagekit',
          providerFileId: 'file_keep',
        },
        {
          action: 'add',
          url: 'https://ik.imagekit.io/x/b.jpg',
          provider: 'imagekit',
          providerFileId: 'file_drop',
        },
        {
          action: 'add',
          url: 'https://images.pexels.com/photos/1.jpg',
          provider: 'pexels',
          providerFileId: 'pexels-1',
        },
      ],
    };

    const next = await prepareProposedImagesForApprove(changes, {
      publicImageStorage,
      imageStorage,
      decisions: [
        { key: '0', decision: 'approve' },
        { key: 'file_drop', decision: 'reject' },
      ],
    });

    expect(promoteWordImageFromStaging).toHaveBeenCalledTimes(1);
    expect(deleteStagingWordImage).toHaveBeenCalledTimes(2); // drop + after promote keep
    expect(next.images).toEqual([
      expect.objectContaining({
        provider: 'github',
        providerFileId: 'assets/words/a.jpg',
        url: 'https://cdn.jsdelivr.net/gh/sambasku/images/assets/words/a.jpg',
      }),
      expect.objectContaining({
        provider: 'pexels',
        providerFileId: 'pexels-1',
      }),
    ]);
  });

  it('kirim bytes sensor ke promote', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const changes: ProposedChanges = {
      images: [
        {
          action: 'add',
          url: 'https://ik.imagekit.io/x/a.jpg',
          provider: 'imagekit',
          providerFileId: 'file_a',
        },
      ],
    };

    await prepareProposedImagesForApprove(changes, {
      publicImageStorage,
      imageStorage,
      censoredFiles: { '0': { bytes: jpeg, mimeType: 'image/jpeg' } },
    });

    expect(promoteWordImageFromStaging).toHaveBeenCalledWith(
      expect.objectContaining({ providerFileId: 'file_a' }),
      publicImageStorage,
      expect.objectContaining({ bytes: jpeg, mimeType: 'image/jpeg' }),
    );
  });

  it('deleteProposedStagingImages hanya ImageKit add', async () => {
    await deleteProposedStagingImages(
      {
        images: [
          {
            action: 'add',
            url: 'https://ik.imagekit.io/x/a.jpg',
            provider: 'imagekit',
            providerFileId: 'file_a',
          },
          {
            action: 'add',
            url: 'https://images.pexels.com/1.jpg',
            provider: 'pexels',
            providerFileId: 'p1',
          },
          { action: 'remove', imageId: '01IMG000000000000000000000' },
        ],
      },
      imageStorage,
    );

    expect(deleteStagingWordImage).toHaveBeenCalledTimes(1);
    expect(deleteStagingWordImage).toHaveBeenCalledWith(
      expect.objectContaining({ providerFileId: 'file_a' }),
      imageStorage,
    );
  });
});
