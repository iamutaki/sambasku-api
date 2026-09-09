// Context variables Hono lintas modul (di-set middleware shared)
export interface AuthUser {
  user_id: string; // ULID
  role: string;
}

export interface AppVariables {
  requestId: string;
  user?: AuthUser;
}
