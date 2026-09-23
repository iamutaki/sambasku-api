import type { Context } from 'hono';
import { BadRequestError, UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { GetPublicProfileUseCase } from '../../application/use-cases/get-public-profile.use-case';
import type { GetPublicActivityUseCase } from '../../application/use-cases/get-public-activity.use-case';
import type { UploadAvatarUseCase } from '../../application/use-cases/upload-avatar.use-case';
import type { DeleteAvatarUseCase } from '../../application/use-cases/delete-avatar.use-case';
import { MAX_IMAGE_BYTES } from '@/modules/public-image/application/utils/validate-image-file';

export class UserController {
  constructor(
    private readonly deps: {
      getPublicProfile: GetPublicProfileUseCase;
      getPublicActivity: GetPublicActivityUseCase;
      uploadAvatar: UploadAvatarUseCase;
      deleteAvatar: DeleteAvatarUseCase;
    },
  ) {}

  async publicProfile(c: Context, username: string) {
    const profile = await this.deps.getPublicProfile.execute(username);

    return c.json({
      success: true as const,
      data: {
        username: profile.username,
        role: profile.role,
        is_verifier: profile.isVerifier,
        joined_at: profile.joinedAt.toISOString(),
        avatar_url: profile.avatarUrl,
        stats: {
          contributions_approved: profile.stats.contributionsApproved,
          verifications_done: profile.stats.verificationsDone,
          comments_published: profile.stats.commentsPublished,
        },
      },
    });
  }

  async publicActivity(c: Context, username: string) {
    const items = await this.deps.getPublicActivity.execute(username);
    return c.json({
      success: true as const,
      data: {
        items: items.map((item) => ({
          kind: item.kind,
          occurred_at: item.occurredAt.toISOString(),
          word_id: item.wordId,
          lemma: item.lemma,
          summary: item.summary,
        })),
      },
    });
  }

  async uploadAvatar(c: Context) {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');

    const contentLength = Number(c.req.header('content-length') ?? 0);
    if (contentLength > MAX_IMAGE_BYTES + 1024 * 1024) {
      throw new BadRequestError('IMAGE_TOO_LARGE', 'File gambar terlalu besar (maks 5 MB)', [
        { field: 'file', message: 'Ukuran maksimal 5 MB' },
      ]);
    }

    const body = await c.req.parseBody({ all: true });
    const filePart = body['file'];
    if (!filePart || typeof filePart === 'string') {
      throw new BadRequestError('VALIDATION_ERROR', 'File gambar wajib diunggah', [
        { field: 'file', message: 'Field multipart `file` wajib berisi file' },
      ]);
    }

    const file = filePart as File;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await this.deps.uploadAvatar.execute(user.user_id, {
      bytes,
      mimeType: file.type || null,
      filename: file.name || null,
    });

    return c.json(
      {
        success: true as const,
        data: { avatar_url: result.avatarUrl },
      },
      200,
    );
  }

  async deleteAvatar(c: Context) {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    await this.deps.deleteAvatar.execute(user.user_id);
    return c.body(null, 204);
  }
}
