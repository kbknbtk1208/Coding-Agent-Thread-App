import type { ReviewProviderKind } from './review-workspace';

export type RevisionContextStatus = 'active' | 'stale' | 'orphaned';

export interface RevisionContext {
  revisionId: string;
  reviewWorkspaceId: string;
  provider: ReviewProviderKind;
  reviewId: string;
  baseSha: string;
  headSha: string;
  startSha: string | null;
  sourceBranchName: string | null;
  diffVersion: string | null;
  isActive: boolean;
  status: RevisionContextStatus;
  createdAt: string;
  updatedAt: string;
}
