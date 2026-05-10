import type { ReviewProviderKind } from './review-workspace';

export type ReviewChangedFileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'unknown';

export type ReviewRemoteThreadAnchorStatus = 'current' | 'outdated' | 'unanchored' | 'overview';

export interface ReviewRemoteCommentAuthor {
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ReviewRemoteComment {
  providerCommentId: string;
  author: ReviewRemoteCommentAuthor;
  body: string;
  url: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export type ReviewRemoteThreadLocation =
  | {
      kind: 'diff';
      filePath: string;
      oldPath: string | null;
      startLine: number | null;
      endLine: number | null;
      side: 'LEFT' | 'RIGHT';
    }
  | { kind: 'overview' };

export interface ReviewRemoteThread {
  providerThreadId: string;
  location: ReviewRemoteThreadLocation;
  anchorStatus: ReviewRemoteThreadAnchorStatus;
  isResolved: boolean | null;
  isOutdated: boolean | null;
  comments: ReviewRemoteComment[];
  providerContext: {
    remoteDiscussionId: string;
    remoteCommentIds: string[];
    anchorRefs: Record<string, unknown>;
    resolve?: {
      githubReviewThreadNodeId?: string;
      gitlabDiscussionId?: string;
    };
  };
}

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
  remoteThreads: ReviewRemoteThread[];
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
