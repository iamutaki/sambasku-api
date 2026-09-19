import { describe, it, expect } from 'vitest';
import { normalizeIdPhone } from '../../presentation/v1/validators/register.validator';

describe('normalizeIdPhone', () => {
  it('mengubah digit nasional ke 62… (tanpa +)', () => {
    expect(normalizeIdPhone('89988887777')).toBe('6289988887777');
  });

  it('menerima 08…, +62…, dan 62…', () => {
    expect(normalizeIdPhone('089988887777')).toBe('6289988887777');
    expect(normalizeIdPhone('+6289988887777')).toBe('6289988887777');
    expect(normalizeIdPhone('6289988887777')).toBe('6289988887777');
  });

  it('kosong → null', () => {
    expect(normalizeIdPhone(undefined)).toBeNull();
    expect(normalizeIdPhone('')).toBeNull();
    expect(normalizeIdPhone('   ')).toBeNull();
  });

  it('tidak valid → sentinel', () => {
    expect(normalizeIdPhone('123')).toBe('__INVALID__');
    expect(normalizeIdPhone('71234567890')).toBe('__INVALID__');
  });
});
