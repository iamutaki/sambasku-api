import { describe, it, expect, vi } from 'vitest';
import {
  GetWordOfDayUseCase,
  wibDateString,
} from '../../application/use-cases/get-word-of-day.use-case';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { WordDetail } from '../../domain/entities/word.entity';

const WIB_NOW = new Date('2026-09-21T10:00:00Z'); // 17:00 WIB → 2026-09-21

function makeDetail(verifiedAt: Date | null): WordDetail {
  return { id: 'A'.repeat(26), verifiedAt } as unknown as WordDetail;
}

function makeRepo(overrides: Record<string, ReturnType<typeof vi.fn>>) {
  return overrides as unknown as WordRepository;
}

describe('wibDateString', () => {
  it('UTC+7: 21 Sep 10:00 UTC masih 21 Sep di WIB, 16:59+ UTC sudah esok', () => {
    expect(wibDateString(WIB_NOW)).toBe('2026-09-21');
    // 2026-09-21T17:00:01Z = 2026-09-22 00:00:01 WIB
    expect(wibDateString(new Date('2026-09-21T17:00:01Z'))).toBe('2026-09-22');
  });
});

describe('GetWordOfDayUseCase', () => {
  it('tanggal sama → hasil instance sama (cache), repo dipanggil sekali', async () => {
    const findWordOfDayId = vi.fn().mockResolvedValue('A'.repeat(26));
    const findDetailById = vi
      .fn()
      .mockResolvedValue(makeDetail(new Date('2026-09-01T00:00:00Z')));
    const uc = new GetWordOfDayUseCase(makeRepo({ findWordOfDayId, findDetailById }));

    const first = await uc.execute(WIB_NOW);
    const second = await uc.execute(new Date('2026-09-21T12:00:00Z')); // hari WIB sama

    expect(second).toBe(first); // cache: identik by reference
    expect(findWordOfDayId).toHaveBeenCalledTimes(1);
    expect(findWordOfDayId).toHaveBeenCalledWith('2026-09-21');
    expect(first?.date).toBe('2026-09-21');
    expect(first?.word?.id).toBe('A'.repeat(26));
  });

  it('tanggal WIB berganti → query baru memakai tanggal baru', async () => {
    const findWordOfDayId = vi.fn().mockResolvedValue('B'.repeat(26));
    const findDetailById = vi.fn().mockResolvedValue(makeDetail(null));
    const uc = new GetWordOfDayUseCase(makeRepo({ findWordOfDayId, findDetailById }));

    await uc.execute(new Date('2026-09-21T17:00:00Z')); // 22 Sep 00:00 WIB
    await uc.execute(new Date('2026-09-22T05:00:00Z')); // masih 22 Sep WIB

    expect(findWordOfDayId).toHaveBeenCalledWith('2026-09-22');
    expect(findWordOfDayId).toHaveBeenCalledTimes(1);
  });

  it('korpus kosong → word null, tetap di-cache (bukan error)', async () => {
    const findWordOfDayId = vi.fn().mockResolvedValue(null);
    const findDetailById = vi.fn();
    const uc = new GetWordOfDayUseCase(makeRepo({ findWordOfDayId, findDetailById }));

    const result = await uc.execute(WIB_NOW);

    expect(result.word).toBeNull();
    expect(result.date).toBe('2026-09-21');
    expect(result.isNewThisWeek).toBe(false);
    expect(findDetailById).not.toHaveBeenCalled();
  });

  it('is_new_this_week: verified_at 3 hari lalu true, 8 hari lalu false', async () => {
    const findWordOfDayId = vi.fn().mockResolvedValue('A'.repeat(26));
    const uc = new GetWordOfDayUseCase(
      makeRepo({
        findWordOfDayId,
        findDetailById: vi
          .fn()
          .mockResolvedValueOnce(makeDetail(new Date('2026-09-18T10:00:00Z')))
          .mockResolvedValueOnce(makeDetail(new Date('2026-09-13T10:00:00Z'))),
      }),
    );

    const baru = await uc.execute(WIB_NOW);
    expect(baru.isNewThisWeek).toBe(true);

    // Paksa cache miss dengan tanggal WIB berbeda
    const lama = await uc.execute(new Date('2026-09-21T17:00:01Z'));
    expect(lama.isNewThisWeek).toBe(false);
  });

  it('race: id terpilih tapi detail null (ter-unpublish) → word null tanpa throw', async () => {
    const findWordOfDayId = vi.fn().mockResolvedValue('A'.repeat(26));
    const findDetailById = vi.fn().mockResolvedValue(null);
    const uc = new GetWordOfDayUseCase(makeRepo({ findWordOfDayId, findDetailById }));

    const result = await uc.execute(WIB_NOW);

    expect(result.word).toBeNull();
    expect(result.isNewThisWeek).toBe(false);
  });
});
