import type {
  NormalizedReviewData,
  ReviewAnchor,
  ReviewComment,
  ReviewProvider,
  ReviewThread,
} from '../../shared/domain/review';
import { adaptGitHub } from './adapters/github-adapter';
import { adaptGitLab } from './adapters/gitlab-adapter';
import {
  GITHUB_MOCK_COMMENTS,
  GITHUB_MOCK_FILE_CONTENTS,
  GITHUB_MOCK_FILES,
} from './mock/github-mock-response';
import {
  GITLAB_MOCK_DISCUSSIONS,
  GITLAB_MOCK_DIFFS,
  GITLAB_MOCK_FILE_CONTENTS,
} from './mock/gitlab-mock-response';

export class ReviewGateway {
  private snapshots = new Map<string, NormalizedReviewData>();
  private threadIdCounter = 0;
  private commentIdCounter = 0;

  private snapshotKey(reviewId: string, provider: ReviewProvider): string {
    return `${provider}:${reviewId}`;
  }

  getReviewData(reviewId: string, provider: ReviewProvider): NormalizedReviewData {
    const key = this.snapshotKey(reviewId, provider);
    const existing = this.snapshots.get(key);
    if (existing) {
      return existing;
    }

    let data: NormalizedReviewData;
    switch (provider) {
      case 'github':
        data = adaptGitHub(
          GITHUB_MOCK_FILES,
          GITHUB_MOCK_COMMENTS,
          GITHUB_MOCK_FILE_CONTENTS,
          reviewId,
        );
        break;
      case 'gitlab':
        data = adaptGitLab(
          GITLAB_MOCK_DIFFS,
          GITLAB_MOCK_DISCUSSIONS,
          GITLAB_MOCK_FILE_CONTENTS,
          reviewId,
        );
        break;
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unknown provider: ${_exhaustive}`);
      }
    }

    this.snapshots.set(key, data);
    return data;
  }

  createThread(
    reviewId: string,
    provider: ReviewProvider,
    fileId: string,
    anchor: ReviewAnchor,
    body: string,
  ): ReviewThread {
    const key = this.snapshotKey(reviewId, provider);
    const snapshot = this.snapshots.get(key);
    if (!snapshot) {
      throw new Error(`No snapshot found for ${key}. Call getReviewData first.`);
    }

    const file = snapshot.files.find((f) => f.fileId === fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const now = new Date().toISOString();
    const comment: ReviewComment = {
      commentId: `local-comment-${++this.commentIdCounter}`,
      author: 'You',
      body,
      position: {
        filePath: anchor.filePath,
        startLine: anchor.startLine,
        endLine: anchor.endLine,
        side: anchor.side,
      },
      createdAt: now,
    };

    const thread: ReviewThread = {
      threadId: `local-thread-${++this.threadIdCounter}`,
      anchor,
      comments: [comment],
      isResolved: false,
    };

    file.threads = [...file.threads, thread];

    return thread;
  }

  replyThread(
    reviewId: string,
    provider: ReviewProvider,
    threadId: string,
    body: string,
  ): ReviewThread {
    const key = this.snapshotKey(reviewId, provider);
    const snapshot = this.snapshots.get(key);
    if (!snapshot) {
      throw new Error(`No snapshot found for ${key}. Call getReviewData first.`);
    }

    let targetThread: ReviewThread | undefined;
    for (const file of snapshot.files) {
      const found = file.threads.find((t) => t.threadId === threadId);
      if (found) {
        targetThread = found;
        break;
      }
    }

    if (!targetThread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const rootComment = targetThread.comments[0];
    if (!rootComment) {
      throw new Error(`Thread ${threadId} has no comments — this should never happen.`);
    }

    const now = new Date().toISOString();
    const comment: ReviewComment = {
      commentId: `local-comment-${++this.commentIdCounter}`,
      author: 'You',
      body,
      position: rootComment.position,
      createdAt: now,
    };

    targetThread.comments = [...targetThread.comments, comment];

    return { ...targetThread };
  }
}
