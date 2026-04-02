export type ReviewProvider = 'github' | 'gitlab';

export type DiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export type ReviewContentStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface ReviewSourceDraft {
  provider: ReviewProvider;
  host: string;
  reviewUrl: string;
}

export type ReviewSourceLocator =
  | {
      provider: 'github';
      host: string;
      owner: string;
      repo: string;
      pullNumber: number;
    }
  | {
      provider: 'gitlab';
      host: string;
      projectPathOrId: string;
      mergeRequestIid: number;
    };

export interface ReviewCommentPosition {
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  side: 'old' | 'new';
}

export interface ReviewComment {
  commentId: string;
  author: string;
  body: string;
  createdAt: string;
  position: ReviewCommentPosition | null;
}

export interface ReviewAnchor {
  fileId: string;
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  side: 'old' | 'new';
  kind: 'line' | 'range' | 'file';
}

export type ReviewDiscussionLocation =
  | ({
      kind: 'diff';
    } & Omit<ReviewAnchor, 'kind'>)
  | {
      kind: 'overview';
    };

export interface ReviewSnapshotThread {
  threadId: string;
  location: ReviewDiscussionLocation;
  comments: ReviewComment[];
  isResolved: boolean;
  isOutdated: boolean;
  providerContext: {
    remoteDiscussionId?: string;
    remoteCommentIds: string[];
    anchorRefs: Record<string, unknown>;
  };
}

export interface ReviewSnapshotFile {
  fileId: string;
  filePath: string;
  oldFilePath: string | null;
  changeType: DiffChangeType;
  additions: number;
  deletions: number;
  patch: string | null;
  isLargeDiff: boolean;
  isBinary: boolean;
  contentStatus: ReviewContentStatus;
  oldContent: string;
  newContent: string;
  language: string;
  providerContext: {
    remotePath: string;
    oldRemotePath?: string;
    remoteFileId?: string;
  };
}

export interface ReviewSnapshot {
  snapshotId: string;
  provider: ReviewProvider;
  reviewId: string;
  title: string;
  description: string;
  baseSha: string;
  headSha: string;
  files: ReviewSnapshotFile[];
  discussions: ReviewSnapshotThread[];
  providerContext: {
    host: string;
    reviewUrl: string;
    anchorRefs: Record<string, unknown>;
  };
}

export interface ReviewThread {
  threadId: string;
  anchor: ReviewAnchor;
  comments: ReviewComment[];
  isResolved: boolean;
  isOutdated: boolean;
  providerContext: ReviewSnapshotThread['providerContext'];
}

export interface NormalizedDiffFile extends ReviewSnapshotFile {
  threads: ReviewThread[];
}

export interface NormalizedReviewData {
  snapshotId: string;
  reviewId: string;
  provider: ReviewProvider;
  title: string;
  description: string;
  baseSha: string;
  headSha: string;
  files: NormalizedDiffFile[];
  discussions: ReviewSnapshotThread[];
  providerContext: ReviewSnapshot['providerContext'];
}

export function deriveAnchorKind(
  startLine: number | null,
  endLine: number | null,
): ReviewAnchor['kind'] {
  if (startLine === null && endLine === null) {
    return 'file';
  }
  if (startLine !== null && endLine !== null && startLine !== endLine) {
    return 'range';
  }
  return 'line';
}

export function reviewAnchorFromLocation(location: ReviewDiscussionLocation): ReviewAnchor | null {
  if (location.kind !== 'diff') {
    return null;
  }

  return {
    fileId: location.fileId,
    filePath: location.filePath,
    startLine: location.startLine,
    endLine: location.endLine,
    side: location.side,
    kind: deriveAnchorKind(location.startLine, location.endLine),
  };
}

export function isDiffLocation(
  location: ReviewDiscussionLocation,
): location is Extract<ReviewDiscussionLocation, { kind: 'diff' }> {
  return location.kind === 'diff';
}

export function selectThreadsForFile(
  snapshot: ReviewSnapshot,
  fileId: string,
): ReviewSnapshotThread[] {
  return snapshot.discussions.filter(
    (thread) => thread.location.kind === 'diff' && thread.location.fileId === fileId,
  );
}

export function selectOverviewThreads(snapshot: ReviewSnapshot): ReviewSnapshotThread[] {
  return snapshot.discussions.filter((thread) => thread.location.kind === 'overview');
}

export function toNormalizedReviewData(snapshot: ReviewSnapshot): NormalizedReviewData {
  return {
    snapshotId: snapshot.snapshotId,
    reviewId: snapshot.reviewId,
    provider: snapshot.provider,
    title: snapshot.title,
    description: snapshot.description,
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    files: snapshot.files.map((file) => ({
      ...file,
      threads: selectThreadsForFile(snapshot, file.fileId)
        .map((thread) => {
          const anchor = reviewAnchorFromLocation(thread.location);
          if (!anchor) {
            return null;
          }
          return {
            threadId: thread.threadId,
            anchor,
            comments: thread.comments,
            isResolved: thread.isResolved,
            isOutdated: thread.isOutdated,
            providerContext: thread.providerContext,
          };
        })
        .filter((thread): thread is ReviewThread => thread !== null),
    })),
    discussions: snapshot.discussions,
    providerContext: snapshot.providerContext,
  };
}
