export interface AuthIdentity {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  emailAtProvider: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  deletedBy: string | null;
}

export interface NewAuthIdentity {
  userId: string;
  provider: string;
  providerUserId: string;
  emailAtProvider: string | null;
}
