import { describe, it, expect } from 'vitest';
import type { Context } from 'hono';
import { xDeviceKey } from '../../presentation/v1/anon-contribution.routes';

// 06-api-x-device-id.md - normalisasi key bucket per-device
const ctxWithHeader = (value?: string) =>
  ({ req: { header: () => value } }) as unknown as Context;

describe('xDeviceKey (dual-bucket anonim)', () => {
  it('ULID valid → key bucket anon-dev:<id>', () => {
    const id = '01HXYZABCDEF1234567890';
    expect(xDeviceKey(ctxWithHeader(id))).toBe(`anon-dev:${id}`);
  });

  it('di-trim: spasi di sekitar tidak mengubah key', () => {
    expect(xDeviceKey(ctxWithHeader('  01HXYZABCDEF1234567890  '))).toBe(
      'anon-dev:01HXYZABCDEF1234567890',
    );
  });

  it('absen / kosong / whitespace → null (bucket IP satu-satunya pengikat)', () => {
    expect(xDeviceKey(ctxWithHeader(undefined))).toBeNull();
    expect(xDeviceKey(ctxWithHeader(''))).toBeNull();
    expect(xDeviceKey(ctxWithHeader('   '))).toBeNull();
  });

  it('terlalu pendek (<8) → null', () => {
    expect(xDeviceKey(ctxWithHeader('01HXYZ'))).toBeNull();
  });

  it('boundary: tepat 8 dan tepat 64 karakter → valid', () => {
    expect(xDeviceKey(ctxWithHeader('a'.repeat(8)))).toBe('anon-dev:aaaaaaaa');
    expect(xDeviceKey(ctxWithHeader('d'.repeat(64)))).toBe(`anon-dev:${'d'.repeat(64)}`);
  });

  it('terlalu panjang (>64) → null (abaikan, jangan tolak request)', () => {
    expect(xDeviceKey(ctxWithHeader('x'.repeat(65)))).toBeNull();
  });
});
