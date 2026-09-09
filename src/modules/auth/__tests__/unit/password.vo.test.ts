import { describe, it, expect } from 'vitest';
import { Password } from '../../domain/value-objects/password.vo';
import { Email } from '../../domain/value-objects/email.vo';

describe('Password VO', () => {
  it('menerima password minimal 8 karakter kombinasi huruf+angka', () => {
    expect(Password.create('Password123').value).toBe('Password123');
  });

  it.each(['pendek1', 'abcdefghijklmnop', '12345678901'])('menolak password lemah: %s', (pw) => {
    expect(() => Password.create(pw)).toThrowError();
  });
});

describe('Email VO', () => {
  it('menormalkan ke lowercase', () => {
    expect(Email.create('Budi@Test.COM').value).toBe('budi@test.com');
  });

  it('menolak format tidak valid', () => {
    expect(() => Email.create('bukan-email')).toThrowError();
  });
});
