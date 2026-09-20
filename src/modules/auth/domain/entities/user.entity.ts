export type UserRole = 'root' | 'admin' | 'reviewer' | 'editor' | 'contributor';

// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
export interface User {
  id: string; // ULID
  username: string;
  email: string;
  // Digit internasional tanpa '+', mis. 62899… - null bila user skip saat register
  phone: string | null;
  // NULL untuk user OAuth-only (Section 23) - login password wajib menolaknya
  passwordHash: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null; // soft delete - tidak boleh bisa login lagi
}

export type NewUser = Pick<User, 'username' | 'email' | 'passwordHash' | 'phone'>;

export interface UserListFilter {
  q?: string;
  role?: UserRole;
  limit: number;
  cursor?: string;
}

export interface UserListResult {
  items: User[];
  nextCursor: string | null;
  hasMore: boolean;
}
