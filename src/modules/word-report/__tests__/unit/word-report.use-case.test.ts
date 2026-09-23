import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ValidationError } from '@/shared/errors/app-error';
import { CreateWordReportUseCase } from '../../application/use-cases/create-word-report.use-case';
import { TakedownWordReportUseCase } from '../../application/use-cases/resolve-word-report.use-case';
import { TakedownWordUseCase } from '@/modules/word/application/use-cases/takedown-word.use-case';
import { RestoreWordUseCase } from '@/modules/word/application/use-cases/restore-word.use-case';

const WORD = '01JDWORDMAKATN0000000000A';
const USER = '01JDUSERAUTHOR00000000000A';
const ADMIN = '01JDUSERADMIN000000000000A';

function publishedWord(status = 'published') {
  return {
    id: WORD,
    lemma: 'makatn',
    status,
    createdBy: USER,
    isVerified: true,
    takedownReasonCode: status === 'taken_down' ? 'spam' : null,
  };
}

describe('CreateWordReportUseCase', () => {
  function make(status = 'published', open: unknown = null) {
    const reports = {
      findOpenByUserAndWord: vi.fn().mockResolvedValue(open),
      create: vi.fn().mockResolvedValue({
        id: '01JDREPORT0000000000000000A',
        wordId: WORD,
        status: 'open',
      }),
    };
    const words = { findById: vi.fn().mockResolvedValue(status ? publishedWord(status) : null) };
    const audit = { record: vi.fn() };
    return {
      reports,
      words,
      audit,
      useCase: new CreateWordReportUseCase(reports as never, words as never, audit as never),
    };
  }

  it('kata hilang → 404', async () => {
    const { useCase } = make('');
    const words = { findById: vi.fn().mockResolvedValue(null) };
    const uc = new CreateWordReportUseCase(
      { findOpenByUserAndWord: vi.fn(), create: vi.fn() } as never,
      words as never,
      { record: vi.fn() } as never,
    );
    await expect(
      uc.execute({ wordId: WORD, userId: USER, reasonCode: 'spam' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND' });
    void useCase;
  });

  it('bukan published → 409', async () => {
    const { useCase } = make('draft');
    await expect(
      useCase.execute({ wordId: WORD, userId: USER, reasonCode: 'spam' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_REPORTABLE' });
  });

  it('laporan terbuka ganda → 409', async () => {
    const { useCase, reports } = make('published', { id: 'open' });
    await expect(
      useCase.execute({ wordId: WORD, userId: USER, reasonCode: 'spam' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('other tanpa catatan → 400', async () => {
    const { useCase } = make();
    await expect(
      useCase.execute({ wordId: WORD, userId: USER, reasonCode: 'other', note: '  ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('spam tanpa catatan → tersimpan', async () => {
    const { useCase, reports, audit } = make();
    const row = await useCase.execute({ wordId: WORD, userId: USER, reasonCode: 'spam' });
    expect(row.status).toBe('open');
    expect(reports.create).toHaveBeenCalledWith({
      wordId: WORD,
      userId: USER,
      reasonCode: 'spam',
      note: null,
    });
    expect(audit.record).toHaveBeenCalled();
  });
});

describe('TakedownWordUseCase', () => {
  it('menarik published, menutup laporan terbuka, audit, dan notifikasi pembuat', async () => {
    const wordRepo = {
      findById: vi.fn().mockResolvedValue(publishedWord()),
      takedown: vi.fn().mockResolvedValue(true),
    };
    const audit = { record: vi.fn() };
    const reports = { closeOpenForWord: vi.fn() };
    const inbox = { execute: vi.fn() };
    const useCase = new TakedownWordUseCase(wordRepo as never, audit as never, reports, inbox as never);

    await useCase.execute({
      wordId: WORD,
      actorId: ADMIN,
      reasonCode: 'inappropriate',
      note: 'menyinggung',
    });

    expect(wordRepo.takedown).toHaveBeenCalledWith(WORD, {
      actorId: ADMIN,
      reasonCode: 'inappropriate',
      note: 'menyinggung',
    });
    expect(reports.closeOpenForWord).toHaveBeenCalledWith(WORD, ADMIN, 'menyinggung');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'takedown', entityType: 'word', entityId: WORD }),
    );
    expect(inbox.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        type: 'word_taken_down',
        targetKind: 'word',
        targetId: WORD,
        refreshOnConflict: true,
      }),
    );
  });

  it('bukan published → 409 dan tidak menutup laporan', async () => {
    const reports = { closeOpenForWord: vi.fn() };
    const useCase = new TakedownWordUseCase(
      { findById: vi.fn().mockResolvedValue(publishedWord('draft')), takedown: vi.fn() } as never,
      { record: vi.fn() } as never,
      reports,
    );
    await expect(
      useCase.execute({ wordId: WORD, actorId: ADMIN, reasonCode: 'spam' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_ALREADY_MODERATED' });
    expect(reports.closeOpenForWord).not.toHaveBeenCalled();
  });
});

describe('RestoreWordUseCase', () => {
  it('taken_down → published, jejak audit', async () => {
    const wordRepo = {
      findById: vi.fn().mockResolvedValue(publishedWord('taken_down')),
      restore: vi.fn().mockResolvedValue(true),
    };
    const audit = { record: vi.fn() };
    const useCase = new RestoreWordUseCase(wordRepo as never, audit as never);
    await useCase.execute({ wordId: WORD, actorId: ADMIN });
    expect(wordRepo.restore).toHaveBeenCalledWith(WORD, ADMIN);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'restore',
        newData: { status: 'published', is_verified: true },
      }),
    );
  });

  it('bukan taken_down → 409', async () => {
    const useCase = new RestoreWordUseCase(
      { findById: vi.fn().mockResolvedValue(publishedWord()), restore: vi.fn() } as never,
      { record: vi.fn() } as never,
    );
    await expect(useCase.execute({ wordId: WORD, actorId: ADMIN })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('TakedownWordReportUseCase', () => {
  it('laporan terbuka mendelegasikan takedown kata', async () => {
    const reports = {
      findById: vi.fn().mockResolvedValue({ id: '01JDREPORT0000000000000000A', wordId: WORD, status: 'open' }),
    };
    const takedownWord = { execute: vi.fn() };
    const useCase = new TakedownWordReportUseCase(reports as never, takedownWord as never);
    await useCase.execute({
      id: '01JDREPORT0000000000000000A',
      actorId: ADMIN,
      reasonCode: 'duplicate',
      note: 'sama dengan makan',
    });
    expect(takedownWord.execute).toHaveBeenCalledWith(
      expect.objectContaining({ wordId: WORD, reasonCode: 'duplicate', note: 'sama dengan makan' }),
    );
  });

  it('laporan sudah ditutup → 409', async () => {
    const useCase = new TakedownWordReportUseCase(
      { findById: vi.fn().mockResolvedValue({ id: 'x', status: 'resolved', wordId: WORD }) } as never,
      { execute: vi.fn() } as never,
    );
    await expect(
      useCase.execute({ id: 'x', actorId: ADMIN, reasonCode: 'spam' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_REPORT_ALREADY_RESOLVED' });
  });
});
