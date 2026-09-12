import { ConflictError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { Email } from '../../domain/value-objects/email.vo';
import { Password } from '../../domain/value-objects/password.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { User } from '../../domain/entities/user.entity';
import type { RegisterDto } from '../dto/register.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';

export class RegisterUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(dto: RegisterDto, requestId?: string | null): Promise<User> {
    // VO jadi lapis kedua setelah Zod di presentation — domain tetap menjaga invariant-nya sendiri
    const email = Email.create(dto.email);
    Password.create(dto.password);

    if (await this.userRepo.findByUsername(dto.username)) {
      throw new ConflictError('USERNAME_ALREADY_EXISTS', 'Username sudah dipakai');
    }
    if (await this.userRepo.findByEmail(email.value)) {
      throw new ConflictError('EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar');
    }

    const passwordHash = await this.hasher.hash(dto.password);
    // role default 'contributor' di-set skema DB
    const user = await this.userRepo.save({ username: dto.username, email: email.value, passwordHash });

    // Audit trail (Section 21) — tanpa password/hash di new_data
    await this.auditRepo.record({
      userId: user.id,
      action: 'create',
      entityType: 'user',
      entityId: user.id,
      newData: { username: user.username, email: user.email, role: user.role },
      requestId: requestId ?? null,
    });

    return user;
  }
}
