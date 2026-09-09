import { describe, it, expect, vi } from 'vitest';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { PasswordResetTokenRecord } from '../../domain/repositories/password-reset-token.repository';
import { hashToken } from '../../application/utils/token';

function makeRecord(overrides: Partial<PasswordResetTokenRecord> = {}): PasswordResetTokenRecord {
  return {
    id: '01TESTRESETTOKEN0000000000',
    userId: '01TESTULIDUSERID00000000',
    tokenHash: hashToken('token-benar'),
    isUsed: false,
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  };
}

function makeDeps(record: PasswordResetTokenRecord | null, consumeResult = true) {
  const resetTokenRepo = {
    create: vi.fn(),
    findByHash: vi.fn().mockResolvedValue(record),
    consume: vi.fn().mockResolvedValue(consumeResult),
  } as unknown as PasswordResetTokenRepository;
  const userRepo = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByUsername: vi.fn(),
    save: vi.fn(),
    updatePassword: vi.fn(),
  } as unknown as UserRepository;
  const hasher = {
    hash: vi.fn().mockResolvedValue('argon2id$baru'),
    compare: vi.fn(),
  } as unknown as PasswordHasherPort;

  return {
    userRepo,
    hasher,
    resetTokenRepo,
    useCase: new ResetPasswordUseCase(resetTokenRepo, userRepo, hasher),
  };
}

const dto = { token: 'token-benar', newPassword: 'PasswordBaru1' };

describe('ResetPasswordUseCase', () => {
  it('sukses: konsumsi token atomik lalu update password user', async () => {
    const { useCase, userRepo, hasher, resetTokenRepo } = makeDeps(makeRecord());

    await useCase.execute(dto);

    expect(resetTokenRepo.consume).toHaveBeenCalledWith(hashToken('token-benar'));
    expect(hasher.hash).toHaveBeenCalledWith('PasswordBaru1');
    expect(userRepo.updatePassword).toHaveBeenCalledWith('01TESTULIDUSERID00000000', 'argon2id$baru');
  });

  it('menolak token yang sudah dipakai (is_used) — tidak menyentuh password', async () => {
    const { useCase, userRepo } = makeDeps(makeRecord({ isUsed: true }));

    await expect(useCase.execute(dto)).rejects.toMatchObject({ errorCode: 'RESET_TOKEN_INVALID' });
    expect(userRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('menolak token kadaluarsa', async () => {
    const { useCase } = makeDeps(makeRecord({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(useCase.execute(dto)).rejects.toMatchObject({ errorCode: 'RESET_TOKEN_INVALID' });
  });

  it('menolak token tidak dikenal', async () => {
    const { useCase } = makeDeps(null);

    await expect(useCase.execute(dto)).rejects.toMatchObject({ errorCode: 'RESET_TOKEN_INVALID' });
  });

  it('race konkuren: consume mengembalikan false → ditolak, password TIDAK diubah', async () => {
    // Simulasi request kedua kalah race — token sudah dikonsumsi request pertama
    const { useCase, userRepo } = makeDeps(makeRecord(), /* consumeResult */ false);

    await expect(useCase.execute(dto)).rejects.toMatchObject({ errorCode: 'RESET_TOKEN_INVALID' });
    expect(userRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('menolak password baru yang lemah (invariant domain)', async () => {
    const { useCase } = makeDeps(makeRecord());

    await expect(
      useCase.execute({ token: 'token-benar', newPassword: 'pendek1' }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
});
