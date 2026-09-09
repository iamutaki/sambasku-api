import { ValidationError } from '@/shared/errors/app-error';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(value)) {
      throw new ValidationError([{ field: 'email', message: 'Format email tidak valid' }]);
    }
    return new Email(value);
  }
}
