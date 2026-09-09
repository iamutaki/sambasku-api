export interface LoginDto {
  email: string;
  password: string;
}

// Metadata perangkat untuk record refresh_token
export interface LoginMeta {
  deviceInfo?: string | null;
  ipAddress?: string | null;
}
