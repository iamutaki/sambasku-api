import { describe, it, expect, vi } from 'vitest';
import { RegisterDeviceTokenUseCase } from '../../application/use-cases/register-device-token.use-case';
import { RevokeDeviceTokenUseCase } from '../../application/use-cases/revoke-device-token.use-case';
import { NotifyUserUseCase } from '../../application/use-cases/notify-user.use-case';
import type { DeviceTokenRepository } from '../../domain/repositories/device-token.repository';
import type { PushSenderPort } from '../../application/ports/push-sender.port';

function makeDeviceRepo(overrides: Partial<DeviceTokenRepository> = {}): DeviceTokenRepository {
  return {
    register: vi.fn().mockResolvedValue({
      id: '01DEVICETOKENULID000000000',
      userId: '01USERULID0000000000000000',
      udid: 'udid-1',
      fcmToken: 'fcm-1',
    }),
    revoke: vi.fn().mockResolvedValue(true),
    revokeAllForUser: vi.fn().mockResolvedValue(2),
    listActiveFcmTokensByUserId: vi.fn().mockResolvedValue(['fcm-a', 'fcm-b']),
    ...overrides,
  };
}

describe('RegisterDeviceTokenUseCase', () => {
  it('meneruskan userId/udid/fcmToken ke repository', async () => {
    const repo = makeDeviceRepo();
    const useCase = new RegisterDeviceTokenUseCase(repo);
    const result = await useCase.execute({
      userId: '01USERULID0000000000000000',
      udid: 'udid-1',
      fcmToken: 'fcm-1',
    });
    expect(repo.register).toHaveBeenCalledWith('01USERULID0000000000000000', 'udid-1', 'fcm-1');
    expect(result.udid).toBe('udid-1');
  });
});

describe('RevokeDeviceTokenUseCase', () => {
  it('mengembalikan revoked dari repository', async () => {
    const repo = makeDeviceRepo({ revoke: vi.fn().mockResolvedValue(false) });
    const useCase = new RevokeDeviceTokenUseCase(repo);
    const result = await useCase.execute({
      userId: '01USERULID0000000000000000',
      udid: 'missing',
    });
    expect(result.revoked).toBe(false);
  });
});

describe('NotifyUserUseCase', () => {
  it('skip jika push tidak dikonfigurasi', async () => {
    const repo = makeDeviceRepo();
    const push: PushSenderPort = {
      isConfigured: false,
      send: vi.fn(),
    };
    const useCase = new NotifyUserUseCase(repo, push);
    await useCase.execute({
      userId: '01USERULID0000000000000000',
      title: 't',
      body: 'b',
    });
    expect(repo.listActiveFcmTokensByUserId).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('fan-out ke semua token aktif', async () => {
    const repo = makeDeviceRepo();
    const push: PushSenderPort = {
      isConfigured: true,
      send: vi.fn().mockResolvedValue({ success: ['fcm-a', 'fcm-b'], failed: [] }),
    };
    const useCase = new NotifyUserUseCase(repo, push);
    await useCase.execute({
      userId: '01USERULID0000000000000000',
      title: 'Kontribusi disetujui',
      body: 'Usulan Anda telah disetujui.',
      data: { type: 'contribution_approved' },
    });
    expect(push.send).toHaveBeenCalledWith(
      ['fcm-a', 'fcm-b'],
      expect.objectContaining({ title: 'Kontribusi disetujui' }),
    );
  });
});
