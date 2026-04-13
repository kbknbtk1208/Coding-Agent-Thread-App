import type {
  ReviewProvider,
  ReviewAnchor,
  ReviewDiscussionLocation,
  ReviewSnapshotThread,
} from './review';
import type { ReviewFindingSeverity } from './review-draft';

export type ReviewPublishStatus =
  | 'idle'
  | 'awaiting_approval'
  | 'publishing'
  | 'completed'
  | 'failed';

export type ReviewPublishDraftState = 'ready' | 'edited' | 'publishing' | 'published' | 'failed';

export interface ReviewPublishedRemoteRef {
  provider: ReviewProvider;
  remoteDiscussionId?: string;
  remoteCommentIds: string[];
  publishedAt: string;
}

export interface ReviewPublishDraft {
  publishDraftId: string;
  snapshotId: string;
  runId: string;
  localThreadId: string;
  sourceKind: 'ai-local-thread';
  title: string;
  severity: ReviewFindingSeverity;
  body: string;
  originalBody: string;
  location: ReviewDiscussionLocation;
  anchor: ReviewAnchor | null;
  state: ReviewPublishDraftState;
  lastError: string | null;
  publishedRemote: ReviewPublishedRemoteRef | null;
  updatedAt: string;
}

export interface ReviewPublishResultItem {
  publishDraftId: string;
  localThreadId: string;
  status: 'published' | 'failed';
  remoteThread?: ReviewSnapshotThread;
  errorMessage?: string;
}

export interface ReviewPublishResult {
  snapshotId: string;
  attemptedCount: number;
  publishedCount: number;
  failedCount: number;
  items: ReviewPublishResultItem[];
}
