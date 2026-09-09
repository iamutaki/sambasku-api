import type { NewUser, User } from '../entities/user.entity';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  save(user: NewUser): Promise<User>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
}
