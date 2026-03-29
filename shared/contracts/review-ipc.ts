import type {
  NormalizedReviewData,
  ReviewAnchor,
  ReviewProvider,
  ReviewThread,
} from '../domain/review';

export const REVIEW_IPC_CHANNELS = {
  getReviewData: 'review:get-review-data',
  createThread: 'review:create-thread',
  replyThread: 'review:reply-thread',
} as const;

export interface GetReviewDataInput {
  reviewId: string;
  provider: ReviewProvider;
}

export type GetReviewDataResult = NormalizedReviewData;

export interface CreateReviewThreadInput {
  reviewId: string;
  provider: ReviewProvider;
  fileId: string;
  anchor: ReviewAnchor;
  body: string;
}

export interface CreateReviewThreadResult {
  thread: ReviewThread;
}

export interface ReplyReviewThreadInput {
  reviewId: string;
  provider: ReviewProvider;
  threadId: string;
  body: string;
}

export interface ReplyReviewThreadResult {
  thread: ReviewThread;
}
