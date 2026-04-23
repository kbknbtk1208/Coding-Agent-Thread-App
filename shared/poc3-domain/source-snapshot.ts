import type { ReviewProviderKind } from './review-workspace';

export type ReviewChangedFileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'unknown';

export interface ReviewSourceSnapshot {
  sourceSnapshotId: string;
  revisionId: string;
  provider: ReviewProviderKind;
  reviewId: string;
  title: string;
  description: string;
  baseSha: string;
  headSha: string;
  startSha: string | null;
  diffVersion: string | null;
  changedFiles: ReviewChangedFile[];
  remoteThreadsSummary: ReviewRemoteThreadSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewChangedFile {
  path: string;
  oldPath: string | null;
  status: ReviewChangedFileStatus;
  additions: number | null;
  deletions: number | null;
  patch: string | null;
  hunks: DiffHunkRange[];
}

export interface DiffHunkRange {
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string | null;
  changedNewLines: number[];
  changedOldLines: number[];
}

export interface ReviewRemoteThreadSummary {
  providerThreadId: string;
  filePath: string | null;
  line: number | null;
  side: 'LEFT' | 'RIGHT' | null;
  isResolved: boolean | null;
  commentCount: number;
}
