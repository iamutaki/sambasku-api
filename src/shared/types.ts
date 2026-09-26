// Context variables Hono lintas modul (di-set middleware shared)
export interface AuthUser {
  user_id: string; // ULID
  role: string;
  /** Authorized party dari JWT - api_clients.client_id */
  azp?: string;
  /** Space-separated scopes dari JWT */
  scope?: string;
  /** true jika token lama tanpa azp diizinkan lewat OAUTH_REQUIRE_AZP=false */
  legacyMapped?: boolean;
}

export interface AppVariables {
  requestId: string;
  user?: AuthUser;
}
