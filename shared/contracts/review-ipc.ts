import type { AgentKind } from '../domain/agent';
import type {
  ReviewAnchor,
  ReviewSnapshot,
  ReviewSnapshotFile,
  ReviewSnapshotThread,
  ReviewSourceDraft,
} from '../domain/review';
import type {
  ReviewDraftEnvelope,
  ReviewLocalThread,
  ReviewRunRecord,
  ReviewThreadBinding,
  ReviewThreadReplyRecord,
} from '../domain/review-draft';
import type { ReviewPublishDraft, ReviewPublishResult } from '../domain/review-publish';
import type { AgentSessionSnapshot } from './agent-ipc';

export const REVIEW_IPC_CHANNELS = {
  loadReviewSource: 'review:load-review-source',
  hydrateReviewFile: 'review:hydrate-review-file',
  createThread: 'review:create-thread',
  replyThread: 'review:reply-thread',
  beginDraftReview: 'review:begin-draft-review',
  awaitDraftReviewResult: 'review:await-draft-review-result',
  beginDraftThreadReply: 'review:begin-draft-thread-reply',
  awaitDraftThreadReplyResult: 'review:await-draft-thread-reply-result',
  preparePublishDrafts: 'review:prepare-publish-drafts',
  updatePublishDrafts: 'review:update-publish-drafts',
  publishDrafts: 'review:publish-drafts',
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

export interface BeginDraftReviewInput {
  snapshotId: string;
  reviewAgent: AgentKind;
  instructions: string;
  lensId?: string;
  cwd?: string;
}

export interface BeginDraftReviewResult {
  run: ReviewRunRecord;
  session: AgentSessionSnapshot;
}

export interface AwaitDraftReviewResultInput {
  runId: string;
}

export interface AwaitDraftReviewResultResult {
  result: ReviewDraftEnvelope;
}

export interface BeginDraftThreadReplyInput {
  snapshotId: string;
  localThreadId: string;
  body: string;
  cwd?: string;
}

export interface BeginDraftThreadReplyResult {
  reply: ReviewThreadReplyRecord;
  binding: ReviewThreadBinding;
  session: AgentSessionSnapshot;
}

export interface AwaitDraftThreadReplyResultInput {
  replyId: string;
}

export interface AwaitDraftThreadReplyResultResult {
  thread: ReviewLocalThread;
}

export interface PreparePublishDraftsInput {
  snapshotId: string;
}

export interface PreparePublishDraftsResult {
  drafts: ReviewPublishDraft[];
}

export interface UpdatePublishDraftsInput {
  snapshotId: string;
  drafts: ReviewPublishDraft[];
}

export interface UpdatePublishDraftsResult {
  drafts: ReviewPublishDraft[];
}

export interface PublishDraftsInput {
  snapshotId: string;
  publishDraftIds: string[];
}

export interface PublishDraftsResult {
  result: ReviewPublishResult;
}
