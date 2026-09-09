import { ValidationError } from '@/shared/errors/app-error';

export class Password {
  private constructor(readonly value: string) {}

  static create(raw: string): Password {
    if (raw.length < 8 || !/[a-zA-Z]/.test(raw) || !/[0-9]/.test(raw)) {
      throw new ValidationError([
        { field: 'password', message: 'Password minimal 8 karakter, kombinasi huruf dan angka' },
      ]);
    }
    return new Password(raw);
  }
}
