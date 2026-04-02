import type {
  ReviewAnchor,
  ReviewSnapshot,
  ReviewSnapshotFile,
  ReviewSnapshotThread,
  ReviewSourceDraft,
} from '../domain/review';

export const REVIEW_IPC_CHANNELS = {
  loadReviewSource: 'review:load-review-source',
  hydrateReviewFile: 'review:hydrate-review-file',
  createThread: 'review:create-thread',
  replyThread: 'review:reply-thread',
} as const;

export interface LoadReviewSourceInput {
  source: ReviewSourceDraft;
}

export interface LoadReviewSourceResult {
  snapshot: ReviewSnapshot;
  initialSelectedFileId: string | null;
}

export interface HydrateReviewFileInput {
  snapshotId: string;
  fileId: string;
}

export interface HydrateReviewFileResult {
  file: ReviewSnapshotFile;
}

export interface CreateReviewThreadInput {
  snapshotId: string;
  fileId: string;
  anchor: ReviewAnchor;
  body: string;
}

export interface CreateReviewThreadResult {
  thread: ReviewSnapshotThread;
}

export interface ReplyReviewThreadInput {
  snapshotId: string;
  threadId: string;
  body: string;
}

export interface ReplyReviewThreadResult {
  thread: ReviewSnapshotThread;
}
