import { useCallback, useMemo, useReducer, useRef } from 'react';
import { SplitSide } from '@git-diff-view/react';
import { deriveAnchorKind, reviewAnchorFromLocation } from '../../../shared/domain/review';
import type {
  NormalizedDiffFile,
  NormalizedReviewData,
  ReviewAnchor,
  ReviewComment,
  ReviewContentStatus,
  ReviewSnapshotFile,
  ReviewSnapshotThread,
  ReviewThread,
} from '../../../shared/domain/review';

function nextOptimisticId(prefix: string): string {
  return `${prefix}-optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ReviewState {
  data: NormalizedReviewData;
  pendingThreads: Record<string, boolean>;
  pendingReplies: Record<string, boolean>;
}

type ReviewAction =
  | { type: 'RESET'; data: NormalizedReviewData }
  | { type: 'SET_FILE_CONTENT_STATUS'; fileId: string; contentStatus: ReviewContentStatus }
  | { type: 'REPLACE_FILE'; file: ReviewSnapshotFile }
  | {
      type: 'CREATE_THREAD_OPTIMISTIC';
      fileId: string;
      thread: ReviewThread;
      snapshotThread: ReviewSnapshotThread;
    }
  | {
      type: 'CREATE_THREAD_CONFIRMED';
      optimisticThreadId: string;
      confirmedThread: ReviewThread;
      confirmedSnapshotThread: ReviewSnapshotThread;
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
      confirmedThread: ReviewThread | null;
      confirmedSnapshotThread: ReviewSnapshotThread;
    }
  | {
      type: 'REPLY_THREAD_ROLLBACK';
      threadId: string;
      optimisticCommentId: string;
    };

function replaceFileThreads(
  files: NormalizedDiffFile[],
  fileId: string,
  updater: (threads: ReviewThread[]) => ReviewThread[],
): NormalizedDiffFile[] {
  return files.map((file) => {
    if (file.fileId !== fileId) {
      return file;
    }

    return {
      ...file,
      threads: updater(file.threads),
    };
  });
}

function updateThreadInFiles(
  files: NormalizedDiffFile[],
  threadId: string,
  updater: (thread: ReviewThread) => ReviewThread | null,
): NormalizedDiffFile[] {
  return files.map((file) => {
    const threadIndex = file.threads.findIndex((thread) => thread.threadId === threadId);
    if (threadIndex === -1) {
      return file;
    }

    const updatedThread = updater(file.threads[threadIndex]);
    if (updatedThread === null) {
      return {
        ...file,
        threads: file.threads.filter((thread) => thread.threadId !== threadId),
      };
    }

    const nextThreads = [...file.threads];
    nextThreads[threadIndex] = updatedThread;
    return {
      ...file,
      threads: nextThreads,
    };
  });
}

function updateThreadInDiscussions(
  discussions: ReviewSnapshotThread[],
  threadId: string,
  updater: (thread: ReviewSnapshotThread) => ReviewSnapshotThread | null,
): ReviewSnapshotThread[] {
  return discussions.flatMap((thread) => {
    if (thread.threadId !== threadId) {
      return [thread];
    }

    const updatedThread = updater(thread);
    return updatedThread ? [updatedThread] : [];
  });
}

function replaceFileData(
  files: NormalizedDiffFile[],
  file: ReviewSnapshotFile,
): NormalizedDiffFile[] {
  return files.map((currentFile) => {
    if (currentFile.fileId !== file.fileId) {
      return currentFile;
    }

    return {
      ...file,
      threads: currentFile.threads,
    };
  });
}

function toSnapshotThread(thread: ReviewThread): ReviewSnapshotThread {
  return {
    threadId: thread.threadId,
    location: {
      kind: 'diff',
      fileId: thread.anchor.fileId,
      filePath: thread.anchor.filePath,
      startLine: thread.anchor.startLine,
      endLine: thread.anchor.endLine,
      side: thread.anchor.side,
    },
    comments: thread.comments,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    providerContext: thread.providerContext,
  };
}

function toLegacyThread(thread: ReviewSnapshotThread): ReviewThread | null {
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
}

function toReplyPosition(thread: ReviewSnapshotThread): ReviewComment['position'] {
  if (thread.location.kind !== 'diff') {
    return null;
  }

  return {
    filePath: thread.location.filePath,
    startLine: thread.location.startLine,
    endLine: thread.location.endLine,
    side: thread.location.side,
  };
}

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'RESET':
      return {
        data: action.data,
        pendingThreads: {},
        pendingReplies: {},
      };

    case 'SET_FILE_CONTENT_STATUS':
      return {
        ...state,
        data: {
          ...state.data,
          files: state.data.files.map((file) =>
            file.fileId === action.fileId ? { ...file, contentStatus: action.contentStatus } : file,
          ),
        },
      };

    case 'REPLACE_FILE':
      return {
        ...state,
        data: {
          ...state.data,
          files: replaceFileData(state.data.files, action.file),
        },
      };

    case 'CREATE_THREAD_OPTIMISTIC': {
      const files = replaceFileThreads(state.data.files, action.fileId, (threads) => [
        ...threads,
        action.thread,
      ]);
      return {
        ...state,
        data: {
          ...state.data,
          files,
          discussions: [...state.data.discussions, action.snapshotThread],
        },
        pendingThreads: {
          ...state.pendingThreads,
          [action.thread.threadId]: true,
        },
      };
    }

    case 'CREATE_THREAD_CONFIRMED': {
      const files = replaceFileThreads(state.data.files, action.fileId, (threads) =>
        threads.map((thread) =>
          thread.threadId === action.optimisticThreadId ? action.confirmedThread : thread,
        ),
      );
      const pendingThreads = { ...state.pendingThreads };
      delete pendingThreads[action.optimisticThreadId];

      return {
        ...state,
        data: {
          ...state.data,
          files,
          discussions: updateThreadInDiscussions(
            state.data.discussions,
            action.optimisticThreadId,
            () => action.confirmedSnapshotThread,
          ),
        },
        pendingThreads,
      };
    }

    case 'CREATE_THREAD_ROLLBACK': {
      const files = replaceFileThreads(state.data.files, action.fileId, (threads) =>
        threads.filter((thread) => thread.threadId !== action.optimisticThreadId),
      );
      const pendingThreads = { ...state.pendingThreads };
      delete pendingThreads[action.optimisticThreadId];

      return {
        ...state,
        data: {
          ...state.data,
          files,
          discussions: updateThreadInDiscussions(
            state.data.discussions,
            action.optimisticThreadId,
            () => null,
          ),
        },
        pendingThreads,
      };
    }

    case 'REPLY_THREAD_OPTIMISTIC': {
      const files = updateThreadInFiles(state.data.files, action.threadId, (thread) => ({
        ...thread,
        comments: [...thread.comments, action.comment],
      }));

      return {
        ...state,
        data: {
          ...state.data,
          files,
          discussions: updateThreadInDiscussions(
            state.data.discussions,
            action.threadId,
            (thread) => ({
              ...thread,
              comments: [...thread.comments, action.comment],
            }),
          ),
        },
        pendingReplies: {
          ...state.pendingReplies,
          [action.comment.commentId]: true,
        },
      };
    }

    case 'REPLY_THREAD_CONFIRMED': {
      const files = action.confirmedThread
        ? updateThreadInFiles(state.data.files, action.threadId, () => action.confirmedThread)
        : state.data.files;
      const pendingReplies = { ...state.pendingReplies };
      delete pendingReplies[action.optimisticCommentId];

      return {
        ...state,
        data: {
          ...state.data,
          files,
          discussions: updateThreadInDiscussions(
            state.data.discussions,
            action.threadId,
            () => action.confirmedSnapshotThread,
          ),
        },
        pendingReplies,
      };
    }

    case 'REPLY_THREAD_ROLLBACK': {
      const files = updateThreadInFiles(state.data.files, action.threadId, (thread) => ({
        ...thread,
        comments: thread.comments.filter(
          (comment) => comment.commentId !== action.optimisticCommentId,
        ),
      }));
      const pendingReplies = { ...state.pendingReplies };
      delete pendingReplies[action.optimisticCommentId];

      return {
        ...state,
        data: {
          ...state.data,
          files,
          discussions: updateThreadInDiscussions(
            state.data.discussions,
            action.threadId,
            (thread) => ({
              ...thread,
              comments: thread.comments.filter(
                (comment) => comment.commentId !== action.optimisticCommentId,
              ),
            }),
          ),
        },
        pendingReplies,
      };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown action type: ${(exhaustive as { type: string }).type}`);
    }
  }
}

export interface UseReviewStateReturn {
  data: NormalizedReviewData;
  reset: (data: NormalizedReviewData) => void;
  setFileContentStatus: (fileId: string, contentStatus: ReviewContentStatus) => void;
  replaceFile: (file: ReviewSnapshotFile) => void;
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
      snapshotId: '',
      reviewId: '',
      provider: 'github',
      title: '',
      description: '',
      baseSha: '',
      headSha: '',
      files: [],
      discussions: [],
      providerContext: {
        host: '',
        reviewUrl: '',
        anchorRefs: {},
      },
    },
    pendingThreads: {},
    pendingReplies: {},
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback((data: NormalizedReviewData) => {
    dispatch({ type: 'RESET', data });
  }, []);

  const setFileContentStatus = useCallback((fileId: string, contentStatus: ReviewContentStatus) => {
    dispatch({ type: 'SET_FILE_CONTENT_STATUS', fileId, contentStatus });
  }, []);

  const replaceFile = useCallback((file: ReviewSnapshotFile) => {
    dispatch({ type: 'REPLACE_FILE', file });
  }, []);

  const createThreadOptimistic = useCallback(
    (fileId: string, startLine: number | null, endLine: number, side: SplitSide, body: string) => {
      const current = stateRef.current;
      const file = current.data.files.find((candidate) => candidate.fileId === fileId);
      if (!file) {
        return;
      }

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
        isOutdated: false,
        providerContext: {
          remoteCommentIds: [],
          anchorRefs: {
            localOnly: true,
          },
        },
      };

      dispatch({
        type: 'CREATE_THREAD_OPTIMISTIC',
        fileId,
        thread,
        snapshotThread: toSnapshotThread(thread),
      });

      window.reviewApi
        .createThread({
          snapshotId: current.data.snapshotId,
          fileId,
          anchor,
          body,
        })
        .then((result) => {
          const confirmedThread = toLegacyThread(result.thread);
          if (!confirmedThread) {
            dispatch({ type: 'CREATE_THREAD_ROLLBACK', optimisticThreadId, fileId });
            return;
          }

          dispatch({
            type: 'CREATE_THREAD_CONFIRMED',
            optimisticThreadId,
            confirmedThread,
            confirmedSnapshotThread: result.thread,
            fileId,
          });
        })
        .catch((err: unknown) => {
          console.error('[createThread] Failed to create thread:', err);
          dispatch({ type: 'CREATE_THREAD_ROLLBACK', optimisticThreadId, fileId });
        });
    },
    [],
  );

  const replyThreadOptimistic = useCallback((threadId: string, body: string) => {
    const current = stateRef.current;
    const thread = current.data.discussions.find((candidate) => candidate.threadId === threadId);
    if (!thread) {
      return;
    }

    const optimisticCommentId = nextOptimisticId('comment');
    const comment: ReviewComment = {
      commentId: optimisticCommentId,
      author: 'You',
      body,
      position: toReplyPosition(thread),
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: 'REPLY_THREAD_OPTIMISTIC', threadId, comment });

    window.reviewApi
      .replyThread({
        snapshotId: current.data.snapshotId,
        threadId,
        body,
      })
      .then((result) => {
        dispatch({
          type: 'REPLY_THREAD_CONFIRMED',
          threadId,
          optimisticCommentId,
          confirmedThread: toLegacyThread(result.thread),
          confirmedSnapshotThread: result.thread,
        });
      })
      .catch((err: unknown) => {
        console.error('[replyThread] Failed to reply to thread:', err);
        dispatch({ type: 'REPLY_THREAD_ROLLBACK', threadId, optimisticCommentId });
      });
  }, []);

  return useMemo(
    () => ({
      data: state.data,
      reset,
      setFileContentStatus,
      replaceFile,
      createThreadOptimistic,
      replyThreadOptimistic,
    }),
    [
      state.data,
      reset,
      setFileContentStatus,
      replaceFile,
      createThreadOptimistic,
      replyThreadOptimistic,
    ],
  );
}
