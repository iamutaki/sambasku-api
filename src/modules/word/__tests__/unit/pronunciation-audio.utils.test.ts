import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@/shared/errors/app-error';
import {
  buildPronunciationAudioPath,
  slugifyLemma,
} from '../../application/utils/pronunciation-audio-path';
import {
  clampDurationMs,
  validateAudioFile,
} from '../../application/utils/validate-audio-file';
import {
  bytesToBase64,
  buildJsDelivrPublicUrl,
  parseGithubRepoUrl,
} from '../../application/utils/github-repo-url';

describe('slugifyLemma + buildPronunciationAudioPath', () => {
  it('slugify menurunkan huruf & spasi', () => {
    expect(slugifyLemma('Makatn Besar')).toBe('makatn-besar');
  });

  it('path pakai dialect code + ULID + ekstensi dari MIME', () => {
    const path = buildPronunciationAudioPath({
      dialectCode: 'sambas',
      lemma: 'kong',
      mimeType: 'audio/mp4',
      id: '01J8ZQTESTULID00000000000',
    });
    expect(path).toBe('assets/audio/sambas/kong/01J8ZQTESTULID00000000000.m4a');
  });

  it('tanpa dialect → umum', () => {
    const path = buildPronunciationAudioPath({
      lemma: 'kong',
      mimeType: 'audio/mpeg',
      id: '01J8ZQTESTULID00000000001',
    });
    expect(path).toBe('assets/audio/umum/kong/01J8ZQTESTULID00000000001.mp3');
  });
});

describe('parseGithubRepoUrl', () => {
  it('parse owner/repo', () => {
    expect(parseGithubRepoUrl('https://github.com/iamutaki/sambasku-pronunciation')).toEqual({
      owner: 'iamutaki',
      repo: 'sambasku-pronunciation',
    });
  });
});

describe('buildJsDelivrPublicUrl', () => {
  it('bentuk CDN: cdn.jsdelivr.net/gh/owner/repo@branch/path', () => {
    expect(
      buildJsDelivrPublicUrl({
        owner: 'iamutaki',
        repo: 'sambasku-pronunciation',
        branch: 'main',
        path: 'assets/audio/umum/makatn/01J8ZQTESTULID00000000000.m4a',
      }),
    ).toBe(
      'https://cdn.jsdelivr.net/gh/iamutaki/sambasku-pronunciation@main/assets/audio/umum/makatn/01J8ZQTESTULID00000000000.m4a',
    );
  });

  it('menghilangkan slash awal pada path', () => {
    expect(
      buildJsDelivrPublicUrl({
        owner: 'o',
        repo: 'r',
        branch: 'main',
        path: '/assets/a.wav',
      }),
    ).toBe('https://cdn.jsdelivr.net/gh/o/r@main/assets/a.wav');
  });
});

describe('bytesToBase64', () => {
  it('encode sederhana', () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe(btoa('Hi'));
  });
});

function mp3Id3(): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x49;
  b[1] = 0x44;
  b[2] = 0x33;
  return b;
}

function m4aFtyp(): Uint8Array {
  const b = new Uint8Array(64);
  b[4] = 0x66;
  b[5] = 0x74;
  b[6] = 0x79;
  b[7] = 0x70;
  return b;
}

describe('validateAudioFile', () => {
  it('terima mp3 valid', () => {
    const r = validateAudioFile({ bytes: mp3Id3(), mimeType: 'audio/mpeg', filename: 'a.mp3' });
    expect(r.mimeType).toBe('audio/mpeg');
    expect(r.size).toBe(64);
  });

  it('terima m4a (audio/mp4)', () => {
    const r = validateAudioFile({ bytes: m4aFtyp(), mimeType: 'audio/mp4' });
    expect(r.mimeType).toBe('audio/mp4');
  });

  it('tolak MIME asing', () => {
    expect(() => validateAudioFile({ bytes: mp3Id3(), mimeType: 'audio/flac' })).toThrow(
      BadRequestError,
    );
  });

  it('tolak kosong', () => {
    expect(() => validateAudioFile({ bytes: new Uint8Array(0), mimeType: 'audio/mpeg' })).toThrow(
      BadRequestError,
    );
  });

  it('tolak >5MB', () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big[0] = 0x49;
    big[1] = 0x44;
    big[2] = 0x33;
    expect(() => validateAudioFile({ bytes: big, mimeType: 'audio/mpeg' })).toThrow(BadRequestError);
  });

  it('tolak ../ di filename', () => {
    expect(() =>
      validateAudioFile({ bytes: mp3Id3(), mimeType: 'audio/mpeg', filename: '../x.mp3' }),
    ).toThrow(BadRequestError);
  });

  it('tolak magic mismatch', () => {
    expect(() => validateAudioFile({ bytes: mp3Id3(), mimeType: 'audio/mp4' })).toThrow(
      BadRequestError,
    );
  });
});

describe('clampDurationMs', () => {
  it('clamp / null', () => {
    expect(clampDurationMs(null)).toBeNull();
    expect(clampDurationMs(1500)).toBe(1500);
    expect(clampDurationMs(0)).toBeNull();
    expect(clampDurationMs(700_000)).toBeNull();
  });
});
