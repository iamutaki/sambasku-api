import { eq } from 'drizzle-orm';
import {
  accountDeletionTokens,
  authIdentities,
  bookmarks,
  bugReports,
  deviceTokens,
  emailVerificationOtps,
  notifications,
  passwordResetTokens,
  refreshTokens,
  users,
  verifierApplications,
  wordReports,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors/app-error';
import type {
  AccountErasureArtifacts,
  AccountErasureRepository,
} from '../domain/repositories/account-erasure.repository';

export class AccountErasureRepositoryImpl implements AccountErasureRepository {
  constructor(private readonly db: AppDatabase) {}

  async erase(userId: string): Promise<AccountErasureArtifacts> {
    if (userId === ANONIM_USER_ID) {
      throw new ForbiddenError('FORBIDDEN', 'Akun sistem tidak dapat dihapus');
    }

    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.deletedAt) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
      }

      const reports = await tx
        .select({ images: bugReports.images })
        .from(bugReports)
        .where(eq(bugReports.userId, userId));
      const applications = await tx
        .select({ socialLinks: verifierApplications.socialLinks })
        .from(verifierApplications)
        .where(eq(verifierApplications.userId, userId));

      const privateFileIds = [
        ...reports.flatMap((row) => (row.images ?? []).map((image) => image.provider_file_id)),
        ...applications.flatMap((row) =>
          (row.socialLinks ?? [])
            .map((link) => link.screenshot?.provider_file_id)
            .filter((id): id is string => !!id),
        ),
      ];

      await tx.delete(bookmarks).where(eq(bookmarks.userId, userId));
      await tx.delete(notifications).where(eq(notifications.userId, userId));
      await tx.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await tx.delete(emailVerificationOtps).where(eq(emailVerificationOtps.userId, userId));
      await tx.delete(authIdentities).where(eq(authIdentities.userId, userId));
      await tx.delete(verifierApplications).where(eq(verifierApplications.userId, userId));

      const now = new Date();
      await tx
        .update(bugReports)
        .set({
          userId: null,
          deviceId: null,
          description: 'Dihapus bersama akun.',
          images: [],
          updatedAt: now,
        })
        .where(eq(bugReports.userId, userId));
      await tx
        .update(wordReports)
        .set({ note: null, updatedAt: now })
        .where(eq(wordReports.userId, userId));
      await tx
        .update(passwordResetTokens)
        .set({ isUsed: true })
        .where(eq(passwordResetTokens.userId, userId));
      await tx
        .update(accountDeletionTokens)
        .set({ isUsed: true })
        .where(eq(accountDeletionTokens.userId, userId));

      await tx
        .update(users)
        .set({
          username: `dihapus-${userId}`,
          email: `deleted.${userId}@sambasku.invalid`,
          phone: null,
          passwordHash: null,
          isActive: false,
          canContribute: false,
          avatarUrl: null,
          avatarProvider: null,
          avatarProviderFileId: null,
          avatarSha: null,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      return {
        avatar:
          user.avatarProviderFileId && user.avatarSha
            ? { path: user.avatarProviderFileId, sha: user.avatarSha }
            : null,
        privateFileIds,
      };
    });
  }
}
