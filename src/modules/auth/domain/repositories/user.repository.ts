import type { NewUser, User, UserListFilter, UserListResult, UserRole } from '../entities/user.entity';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  save(user: NewUser): Promise<User>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  markEmailVerified(id: string): Promise<void>;
  list(filter: UserListFilter): Promise<UserListResult>;
  updateRole(id: string, role: UserRole): Promise<void>;
  updatePhone(id: string, phone: string): Promise<void>;
  updateAvatar(
    id: string,
    data: {
      avatarUrl: string;
      avatarProvider: string;
      avatarProviderFileId: string;
      avatarSha: string;
    },
  ): Promise<void>;
  clearAvatar(id: string): Promise<void>;
}
