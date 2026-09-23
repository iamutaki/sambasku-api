import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  NewVerifierApplication,
  VerifierApplication,
  VerifierApplicationListItem,
  VerifierApplicationStatus,
  SocialLink,
} from '../entities/verifier-application.entity';

export interface VerifierApplicationListFilter {
  status?: VerifierApplicationStatus;
  limit: number;
  cursor?: string;
}

export interface VerifierApplicationWriteInput {
  phone: string;
  address: string;
  socialLinks: SocialLink[];
}

export interface VerifierApplicationRepository {
  create(input: NewVerifierApplication): Promise<VerifierApplication>;
  createWithPhone(input: NewVerifierApplication): Promise<VerifierApplication>;
  findByUserId(userId: string): Promise<VerifierApplication | null>;
  findById(id: string): Promise<VerifierApplication | null>;
  list(filter: VerifierApplicationListFilter): Promise<CursorPage<VerifierApplicationListItem>>;
  resubmit(userId: string, input: VerifierApplicationWriteInput): Promise<VerifierApplication | null>;
  resubmitWithPhone(
    userId: string,
    input: VerifierApplicationWriteInput,
  ): Promise<VerifierApplication | null>;
  approveAtomically(id: string, reviewerId: string): Promise<VerifierApplication>;
  markApproved(id: string, reviewerId: string): Promise<VerifierApplication | null>;
  markRejected(id: string, reviewerId: string, comment: string): Promise<VerifierApplication | null>;
}
