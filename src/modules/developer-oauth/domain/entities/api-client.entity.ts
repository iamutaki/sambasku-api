export type ApiClientStatus = 'pending' | 'approved' | 'suspended' | 'revoked';
export type ApiClientChannel = 'web' | 'mobile';

export interface ApiClient {
  id: string;
  clientId: string;
  clientSecretHash: string | null;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  status: ApiClientStatus;
  isFirstParty: boolean;
  homepageUrl: string | null;
  privacyUrl: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  allowedChannels: ApiClientChannel[];
  rateLimitTier: string;
  createdAt: Date;
  updatedAt: Date | null;
}

/** Scopes penuh untuk klien first-party. */
export const FIRST_PARTY_SCOPES = [
  'vote.write',
  'comment.write',
  'contribute.write',
  'translation_help.write',
  'bookmark.write',
  'profile.read',
  'device.write',
] as const;

export type FirstPartyScope = (typeof FIRST_PARTY_SCOPES)[number];

export const FIRST_PARTY_SCOPE_STRING = FIRST_PARTY_SCOPES.join(' ');

export const FIRST_PARTY_CLIENT_IDS = {
  mobile: 'sambasku-mobile',
  web: 'sambasku-web',
  console: 'sambasku-console',
} as const;
