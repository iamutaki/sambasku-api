import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import { ForbiddenError, UnauthorizedError, ValidationError } from '@/shared/errors/app-error';
import { Email } from '../../domain/value-objects/email.vo';
import type { AccountDeletionTokenRepository } from '../../domain/repositories/account-deletion-token.repository';
import type { AccountErasureRepository } from '../../domain/repositories/account-erasure.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { MailerPort } from '../ports/mailer.port';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import { formatOtpDisplay, generateOtpCode, hashOtp, normalizeOtpCode, OTP_TTL_MS } from '../utils/otp';

const CONFIRMATION = 'HAPUS';
const INVALID_CODE = 'Kode tidak valid atau sudah kedaluwarsa';

export class AccountDeletionUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly erasure: AccountErasureRepository,
    private readonly deletionTokens: AccountDeletionTokenRepository,
    private readonly mailer: MailerPort,
    private readonly publicImages: PublicImageStoragePort,
    private readonly privateImages: ImageStoragePort,
    private readonly auditRepo: AuditLogRepository,
    private readonly deletionPageUrl: string,
  ) {}

  /** Akun yang sedang masuk. Kata sandi wajib jika akun punya password. */
  async deleteOwn(
    input: { userId: string; password?: string | null; confirmation: string },
    requestId?: string | null,
  ): Promise<void> {
    this.assertConfirmation(input.confirmation);

    const user = await this.userRepo.findById(input.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
    }
    if (user.id === ANONIM_USER_ID) {
      throw new ForbiddenError('FORBIDDEN', 'Akun sistem tidak dapat dihapus');
    }

    if (user.passwordHash) {
      const password = input.password?.trim() ?? '';
      if (!password) {
        throw new ValidationError([{ field: 'password', message: 'Kata sandi wajib diisi' }]);
      }
      const match = await this.hasher.compare(password, user.passwordHash);
      if (!match) {
        throw new UnauthorizedError('INVALID_CREDENTIALS', 'Kata sandi salah');
      }
    }

    await this.erase(user.id, 'in_app', requestId);
  }

  /** Selalu sukses di mata pemanggil — email yang tidak terdaftar tidak dibedakan. */
  async requestByEmail(emailRaw: string): Promise<void> {
    // Sama pola resend-otp: simpan email lowercase; lookup tanpa normalize
    // = silent miss (UI tetap "kode dikirim") meski akun ada.
    let email: Email;
    try {
      email = Email.create(emailRaw);
    } catch {
      return;
    }

    const user = await this.userRepo.findByEmail(email.value);
    if (!user || user.deletedAt || user.id === ANONIM_USER_ID) return;

    await this.deletionTokens.invalidateUnusedForUser(user.id);
    const code = generateOtpCode();
    await this.deletionTokens.create({
      userId: user.id,
      tokenHash: hashOtp(user.id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await this.mailer.sendAccountDeletionEmail(user.email, formatOtpDisplay(code), this.deletionPageUrl);
  }

  async confirmByEmail(
    input: { email: string; code: string; confirmation: string },
    requestId?: string | null,
  ): Promise<void> {
    this.assertConfirmation(input.confirmation);
    const digits = normalizeOtpCode(input.code);
    let email: Email | null = null;
    try {
      email = Email.create(input.email);
    } catch {
      email = null;
    }
    const user = digits && email ? await this.userRepo.findByEmail(email.value) : null;
    if (!digits || !user || user.deletedAt || user.id === ANONIM_USER_ID) {
      throw new UnauthorizedError('DELETION_CODE_INVALID', INVALID_CODE);
    }

    const tokenHash = hashOtp(user.id, digits);
    const record = await this.deletionTokens.findByHash(tokenHash);
    if (!record || record.isUsed || record.expiresAt.getTime() < Date.now() || record.userId !== user.id) {
      throw new UnauthorizedError('DELETION_CODE_INVALID', INVALID_CODE);
    }
    const consumed = await this.deletionTokens.consume(tokenHash);
    if (!consumed) {
      throw new UnauthorizedError('DELETION_CODE_INVALID', INVALID_CODE);
    }

    await this.erase(user.id, 'email', requestId);
  }

  private assertConfirmation(confirmation: string): void {
    if (confirmation !== CONFIRMATION) {
      throw new ValidationError([
        { field: 'confirmation', message: 'Ketik HAPUS untuk mengonfirmasi' },
      ]);
    }
  }

  private async erase(userId: string, via: 'in_app' | 'email', requestId?: string | null): Promise<void> {
    const artifacts = await this.erasure.erase(userId);
    if (artifacts.avatar) {
      await this.publicImages.delete(artifacts.avatar.path, artifacts.avatar.sha);
    }
    for (const fileId of artifacts.privateFileIds) {
      await this.privateImages.deleteFile(fileId);
    }
    await this.auditRepo.record({
      userId,
      action: 'delete',
      entityType: 'user',
      entityId: userId,
      newData: { via },
      requestId: requestId ?? null,
    });
  }
}
