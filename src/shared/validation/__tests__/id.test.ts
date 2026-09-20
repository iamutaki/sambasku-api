import { describe, expect, it } from 'vitest';
import { choiceId, opaqueId } from '@/shared/validation/id';

const VALID = '01WCNOMINA0000000000000000';

describe('choiceId', () => {
  const schema = choiceId('Kelas kata');

  it('ULID 26 karakter valid', () => {
    expect(schema.parse(VALID)).toBe(VALID);
  });

  it('kosong / hilang → "wajib dipilih", bukan jargon ULID', () => {
    expect(schema.safeParse('').error?.issues[0]?.message).toBe('Kelas kata wajib dipilih');
    expect(schema.safeParse(undefined).error?.issues[0]?.message).toBe('Kelas kata wajib dipilih');
  });

  it('panjang salah → "tidak valid", bukan "ULID 26 karakter"', () => {
    const message = schema.safeParse('bukan-ulid').error?.issues[0]?.message;
    expect(message).toBe('Kelas kata tidak valid. Pilih ulang dari daftar.');
    expect(message).not.toMatch(/ULID/i);
  });
});

describe('opaqueId', () => {
  it('pesan tidak menyebut ULID', () => {
    const message = opaqueId.safeParse('pendek').error?.issues[0]?.message;
    expect(message).toBe('Data tidak valid. Muat ulang halaman, lalu coba lagi.');
    expect(message).not.toMatch(/ULID/i);
  });
});
