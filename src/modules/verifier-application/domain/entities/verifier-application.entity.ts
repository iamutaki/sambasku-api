export type VerifierApplicationStatus = 'pending' | 'approved' | 'rejected';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'website';

export interface SocialScreenshot {
  url: string;
  provider_file_id: string;
}

export interface SocialLink {
  platform: SocialPlatform;
  username: string;
  screenshot: SocialScreenshot;
}

export interface VerifierApplication {
  id: string;
  userId: string;
  username: string | null;
  phone: string;
  address: string;
  socialLinks: SocialLink[];
  status: VerifierApplicationStatus;
  adminComment: string | null;
  reviewedBy: string | null;
  /** Username admin/root yang memutuskan; null jika belum direview atau akun reviewer hilang. */
  reviewedByUsername: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface NewVerifierApplication {
  userId: string;
  phone: string;
  address: string;
  socialLinks: SocialLink[];
}

export interface VerifierApplicationListItem {
  id: string;
  userId: string;
  username: string | null;
  phone: string;
  status: VerifierApplicationStatus;
  createdAt: Date;
}
