import { useCallback, useMemo, useReducer, useRef } from 'react';
import { SplitSide } from '@git-diff-view/react';
import { deriveAnchorKind } from '../../../shared/domain/review';
import type {
  NormalizedDiffFile,
  NormalizedReviewData,
  ReviewAnchor,
  ReviewComment,
  ReviewThread,
} from '../../../shared/domain/review';

/* ------------------------------------------------------------------ */
/*  Stable optimistic ID generation (HMR-safe)                         */
/* ------------------------------------------------------------------ */

function nextOptimisticId(prefix: string): string {
  return `${prefix}-optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  State & Actions                                                    */
/* ------------------------------------------------------------------ */

interface ReviewState {
  data: NormalizedReviewData;
  /** Maps optimistic threadId -> pending status */
  pendingThreads: Record<string, boolean>;
  /** Maps optimistic threadId -> pending reply status */
  pendingReplies: Record<string, boolean>;
}

type ReviewAction =
  | { type: 'RESET'; data: NormalizedReviewData }
  | {
      type: 'CREATE_THREAD_OPTIMISTIC';
      fileId: string;
      thread: ReviewThread;
    }
  | {
      type: 'CREATE_THREAD_CONFIRMED';
      optimisticThreadId: string;
      confirmedThread: ReviewThread;
      fileId: string;
    }
  | {
      type: 'CREATE_THREAD_ROLLBACK';
      optimisticThreadId: string;
      fileId: string;
    }
  | {
      type: 'REPLY_THREAD_OPTIMISTIC';
      threadId: string;
      comment: ReviewComment;
    }
  | {
      type: 'REPLY_THREAD_CONFIRMED';
      threadId: string;
      optimisticCommentId: string;
      confirmedThread: ReviewThread;
    }
  | {
      type: 'REPLY_THREAD_ROLLBACK';
      threadId: string;
      optimisticCommentId: string;
    };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function replaceFileThreads(
  files: NormalizedDiffFile[],
  fileId: string,
  updater: (threads: ReviewThread[]) => ReviewThread[],
): NormalizedDiffFile[] {
  return files.map((f) => {
    if (f.fileId !== fileId) return f;
    return { ...f, threads: updater(f.threads) };
  });
}

function updateThreadInFiles(
  files: NormalizedDiffFile[],
  threadId: string,
  updater: (thread: ReviewThread) => ReviewThread | null,
): NormalizedDiffFile[] {
  return files.map((f) => {
    const idx = f.threads.findIndex((t) => t.threadId === threadId);
    if (idx === -1) return f;
    const updated = updater(f.threads[idx]);
    if (updated === null) {
      const next = [...f.threads];
      next.splice(idx, 1);
      return { ...f, threads: next };
    }
    const next = [...f.threads];
    next[idx] = updated;
    return { ...f, threads: next };
  });
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'RESET':
      return { data: action.data, pendingThreads: {}, pendingReplies: {} };

    case 'CREATE_THREAD_OPTIMISTIC': {
      const files = replaceFileThreads(state.data.files, action.fileId, (threads) => [
        ...threads,
        action.thread,
      ]);
      return {
        ...state,
        data: { ...state.data, files },
        pendingThreads: { ...state.pendingThreads, [action.thread.threadId]: true },
      };
    }

    case 'CREATE_THREAD_CONFIRMED': {
      const files = replaceFileThreads(state.data.files, action.fileId, (threads) =>
        threads.map((t) => (t.threadId === action.optimisticThreadId ? action.confirmedThread : t)),
      );
      const pending = { ...state.pendingThreads };
      delete pending[action.optimisticThreadId];
      return { ...state, data: { ...state.data, files }, pendingThreads: pending };
    }

    case 'CREATE_THREAD_ROLLBACK': {
      const files = replaceFileThreads(state.data.files, action.fileId, (threads) =>
        threads.filter((t) => t.threadId !== action.optimisticThreadId),
      );
      const pending = { ...state.pendingThreads };
      delete pending[action.optimisticThreadId];
      return { ...state, data: { ...state.data, files }, pendingThreads: pending };
    }

    case 'REPLY_THREAD_OPTIMISTIC': {
      const files = updateThreadInFiles(state.data.files, action.threadId, (thread) => ({
        ...thread,
        comments: [...thread.comments, action.comment],
      }));
      return {
        ...state,
        data: { ...state.data, files },
        pendingReplies: { ...state.pendingReplies, [action.comment.commentId]: true },
      };
    }

    case 'REPLY_THREAD_CONFIRMED': {
      const files = updateThreadInFiles(
        state.data.files,
        action.threadId,
        (_thread) => action.confirmedThread,
      );
      const pending = { ...state.pendingReplies };
      delete pending[action.optimisticCommentId];
      return { ...state, data: { ...state.data, files }, pendingReplies: pending };
    }

    case 'REPLY_THREAD_ROLLBACK': {
      const files = updateThreadInFiles(state.data.files, action.threadId, (thread) => ({
        ...thread,
        comments: thread.comments.filter((c) => c.commentId !== action.optimisticCommentId),
      }));
      const pending = { ...state.pendingReplies };
      delete pending[action.optimisticCommentId];
      return { ...state, data: { ...state.data, files }, pendingReplies: pending };
    }

    default: {
      // Fix #9: throw instead of returning undefined for unknown action types
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseReviewStateReturn {
  data: NormalizedReviewData;
  reset: (data: NormalizedReviewData) => void;
  createThreadOptimistic: (
    fileId: string,
    startLine: number | null,
    endLine: number,
    side: SplitSide,
    body: string,
  ) => void;
  replyThreadOptimistic: (threadId: string, body: string) => void;
}

export function useReviewState(): UseReviewStateReturn {
  const [state, dispatch] = useReducer(reviewReducer, {
    data: {
      reviewId: '',
      provider: 'github',
      title: '',
      description: '',
      files: [],
    },
    pendingThreads: {},
    pendingReplies: {},
  });

  /* Fix #3: keep a ref to the latest state so callbacks never capture stale data */
  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback((data: NormalizedReviewData) => {
    dispatch({ type: 'RESET', data });
  }, []);

  /**
   * Fix #3: `endLine` is typed as `number` (not `number | null`) intentionally.
   * This function only creates line-level or range-level threads — file-level
   * threads (where endLine would be null) are not supported in the current UI.
   * The ReviewAnchor.endLine type is `number | null`, but here we enforce
   * that the caller must always provide a concrete line number.
   */
  const createThreadOptimistic = useCallback(
    (fileId: string, startLine: number | null, endLine: number, side: SplitSide, body: string) => {
      const current = stateRef.current;
      const file = current.data.files.find((f) => f.fileId === fileId);
      if (!file) return;

      const anchorSide: 'old' | 'new' = side === SplitSide.old ? 'old' : 'new';
      const anchor: ReviewAnchor = {
        fileId,
        filePath: file.filePath,
        startLine,
        endLine,
        side: anchorSide,
        kind: deriveAnchorKind(startLine, endLine),
      };

      const optimisticThreadId = nextOptimisticId('thread');
      const optimisticCommentId = nextOptimisticId('comment');
      const now = new Date().toISOString();

      const comment: ReviewComment = {
        commentId: optimisticCommentId,
        author: 'You',
        body,
        position: {
          filePath: file.filePath,
          startLine,
          endLine,
          side: anchorSide,
        },
        createdAt: now,
      };

      const thread: ReviewThread = {
        threadId: optimisticThreadId,
        anchor,
        comments: [comment],
        isResolved: false,
      };

      dispatch({ type: 'CREATE_THREAD_OPTIMISTIC', fileId, thread });

      window.reviewApi
        .createThread({
          reviewId: current.data.reviewId,
          provider: current.data.provider,
          fileId,
          anchor,
          body,
        })
        .then((result) => {
          dispatch({
            type: 'CREATE_THREAD_CONFIRMED',
            optimisticThreadId,
            confirmedThread: result.thread,
            fileId,
          });
        })
        .catch((err: unknown) => {
          // Fix #6: log the error before rolling back
          console.error('[createThread] Failed to create thread:', err);
          dispatch({ type: 'CREATE_THREAD_ROLLBACK', optimisticThreadId, fileId });
        });
    },
    [],
  );

  const replyThreadOptimistic = useCallback((threadId: string, body: string) => {
    const current = stateRef.current;

    /* Fix #6: derive position from the target thread's anchor */
    let anchorPosition: ReviewComment['position'] = {
      filePath: '',
      startLine: null,
      endLine: null,
      side: 'new',
    };
    for (const file of current.data.files) {
      const found = file.threads.find((t) => t.threadId === threadId);
      if (found) {
        anchorPosition = {
          filePath: found.anchor.filePath,
          startLine: found.anchor.startLine,
          endLine: found.anchor.endLine,
          side: found.anchor.side,
        };
        break;
      }
    }

    const optimisticCommentId = nextOptimisticId('comment');
    const now = new Date().toISOString();

    const comment: ReviewComment = {
      commentId: optimisticCommentId,
      author: 'You',
      body,
      position: anchorPosition,
      createdAt: now,
    };

    dispatch({ type: 'REPLY_THREAD_OPTIMISTIC', threadId, comment });

    window.reviewApi
      .replyThread({
        reviewId: current.data.reviewId,
        provider: current.data.provider,
        threadId,
        body,
      })
      .then((result) => {
        dispatch({
          type: 'REPLY_THREAD_CONFIRMED',
          threadId,
          optimisticCommentId,
          confirmedThread: result.thread,
        });
      })
      .catch((err: unknown) => {
        // Fix #6: log the error before rolling back
        console.error('[replyThread] Failed to reply to thread:', err);
        dispatch({ type: 'REPLY_THREAD_ROLLBACK', threadId, optimisticCommentId });
      });
  }, []);

  /* Fix #4: stabilize the return object so consumers get a stable reference */
  return useMemo(
    () => ({ data: state.data, reset, createThreadOptimistic, replyThreadOptimistic }),
    [state.data, reset, createThreadOptimistic, replyThreadOptimistic],
  );
}
