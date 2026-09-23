export type BugReportStatus = 'open' | 'resolved' | 'rejected';
export type BugReportPlatform = 'android' | 'ios';

export interface BugReportImage {
  url: string;
  providerFileId: string;
}

export interface BugReport {
  id: string;
  userId: string | null;
  username: string | null;
  deviceId: string | null;
  description: string;
  images: BugReportImage[];
  appVersion: string | null;
  platform: BugReportPlatform | null;
  status: BugReportStatus;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface NewBugReport {
  userId: string | null;
  deviceId: string | null;
  description: string;
  images: BugReportImage[];
  appVersion: string | null;
  platform: BugReportPlatform | null;
}

export interface BugReportListFilter {
  status?: BugReportStatus;
  limit: number;
  cursor?: string;
}
