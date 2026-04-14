import type { AgentEvent, AppSession } from '../../../shared/domain/agent';
import type {
  ReviewDraftEnvelope,
  ReviewDraftFallbackReason,
  ReviewLocalThread,
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadBinding,
  ReviewThreadMessage,
  ReviewThreadReplyRecord,
} from '../../../shared/domain/review-draft';
import { createLocalThread } from '../../../shared/domain/review-draft';
import {
  applyAgentEventToSession,
  mergeAppSessionSnapshot,
  normalizeAppSession,
} from '../../components/session-event-state';

export type ReviewDraftReviewStatus =
  | 'idle'
  | 'drafting_review'
  | 'showing_local_threads'
  | 'failed';

export interface ReviewDraftState {
  reviewStatus: ReviewDraftReviewStatus;
  latestRun: ReviewRunRecord | null;
  summary: ReviewSummaryDraft | null;
  localThreads: ReviewLocalThread[];
  fallbackRichText: string | null;
  fallbackReason: ReviewDraftFallbackReason | null;
  errorMessage: string | null;
  activeRunSessionId: string | null;
  activeRunSession: AppSession | null;
}

export type ReviewDraftAction =
  | { type: 'RESET' }
  | { type: 'START' }
  | {
      type: 'BEGIN';
      run: ReviewRunRecord;
      session: AppSession;
    }
  | {
      type: 'SYNC_ACTIVE_SESSION';
      session: AppSession;
    }
  | {
      type: 'APPLY_ACTIVE_SESSION_EVENT';
      event: AgentEvent;
    }
  | {
      type: 'RESOLVE_STRUCTURED';
      envelope: Extract<ReviewDraftEnvelope, { kind: 'structured' }>;
    }
  | {
      type: 'RESOLVE_FALLBACK';
      envelope: Extract<ReviewDraftEnvelope, { kind: 'fallback-richText' }>;
    }
  | {
      type: 'BEGIN_THREAD_REPLY';
      localThreadId: string;
      reply: ReviewThreadReplyRecord;
      binding: ReviewThreadBinding;
      session: AppSession;
      userMessage: ReviewThreadMessage;
    }
  | {
      type: 'SYNC_THREAD_SESSION';
      localThreadId: string;
      session: AppSession;
    }
  | {
      type: 'APPLY_THREAD_SESSION_EVENT';
      localThreadId: string;
      event: AgentEvent;
    }
  | {
      type: 'RESOLVE_THREAD_REPLY';
      thread: ReviewLocalThread;
    }
  | {
      type: 'ADD_LOCAL_THREAD';
      thread: ReviewLocalThread;
    }
  | {
      type: 'FAIL_THREAD_REPLY';
      localThreadId: string;
      errorMessage: string;
    }
  | {
      type: 'FAIL';
      errorMessage: string;
      run?: ReviewRunRecord | null;
    };

export function createInitialReviewDraftState(): ReviewDraftState {
  return {
    reviewStatus: 'idle',
    latestRun: null,
    summary: null,
    localThreads: [],
    fallbackRichText: null,
    fallbackReason: null,
    errorMessage: null,
    activeRunSessionId: null,
    activeRunSession: null,
  };
}

function updateLocalThread(
  localThreads: ReviewLocalThread[],
  localThreadId: string,
  updater: (thread: ReviewLocalThread) => ReviewLocalThread,
): ReviewLocalThread[] {
  return localThreads.map((thread) =>
    thread.localThreadId === localThreadId ? updater(thread) : thread,
  );
}

export function reduceReviewDraftState(
  state: ReviewDraftState,
  action: ReviewDraftAction,
): ReviewDraftState {
  switch (action.type) {
    case 'RESET':
      return createInitialReviewDraftState();

    case 'START':
      return {
        reviewStatus: 'drafting_review',
        latestRun: null,
        summary: null,
        localThreads: [],
        fallbackRichText: null,
        fallbackReason: null,
        errorMessage: null,
        activeRunSessionId: null,
        activeRunSession: null,
      };

    case 'BEGIN':
      return {
        ...state,
        reviewStatus: 'drafting_review',
        latestRun: action.run,
        errorMessage: null,
        activeRunSessionId: action.run.rootAppSessionId,
        activeRunSession: normalizeAppSession(action.session),
      };

    case 'SYNC_ACTIVE_SESSION':
      if (!state.activeRunSessionId || action.session.appSessionId !== state.activeRunSessionId) {
        return state;
      }

      return {
        ...state,
        activeRunSession: mergeAppSessionSnapshot(
          state.activeRunSession ?? undefined,
          normalizeAppSession(action.session),
        ),
      };

    case 'APPLY_ACTIVE_SESSION_EVENT':
      if (
        !state.activeRunSessionId ||
        action.event.appSessionId !== state.activeRunSessionId ||
        state.activeRunSession === null
      ) {
        return state;
      }

      return {
        ...state,
        activeRunSession: applyAgentEventToSession(state.activeRunSession, action.event),
      };

    case 'RESOLVE_STRUCTURED':
      return {
        ...state,
        reviewStatus: 'showing_local_threads',
        latestRun: action.envelope.run,
        summary: action.envelope.summary,
        localThreads: action.envelope.threads.map((thread) => createLocalThread(thread)),
        fallbackRichText: null,
        fallbackReason: null,
        errorMessage: null,
      };

    case 'RESOLVE_FALLBACK':
      return {
        ...state,
        reviewStatus: 'showing_local_threads',
        latestRun: action.envelope.run,
        summary: null,
        localThreads: [],
        fallbackRichText: action.envelope.content,
        fallbackReason: action.envelope.reason,
        errorMessage: null,
      };

    case 'BEGIN_THREAD_REPLY':
      return {
        ...state,
        localThreads: updateLocalThread(state.localThreads, action.localThreadId, (thread) => ({
          ...thread,
          binding: action.binding,
          messages: [...thread.messages, action.userMessage],
          replyStatus: 'replying',
          lastError: null,
          activeReplySessionId: action.reply.appSessionId,
          activeReplySession: normalizeAppSession(action.session),
        })),
      };

    case 'SYNC_THREAD_SESSION':
      return {
        ...state,
        localThreads: updateLocalThread(state.localThreads, action.localThreadId, (thread) => ({
          ...thread,
          activeReplySessionId: action.session.appSessionId,
          activeReplySession: mergeAppSessionSnapshot(
            thread.activeReplySession ?? undefined,
            normalizeAppSession(action.session),
          ),
        })),
      };

    case 'APPLY_THREAD_SESSION_EVENT':
      return {
        ...state,
        localThreads: updateLocalThread(state.localThreads, action.localThreadId, (thread) => {
          if (
            thread.activeReplySessionId !== action.event.appSessionId ||
            thread.activeReplySession === null
          ) {
            return thread;
          }

          const activeReplySession = applyAgentEventToSession(
            thread.activeReplySession,
            action.event,
          );

          return {
            ...thread,
            activeReplySession,
            replyStatus: activeReplySession.status === 'failed' ? 'failed' : thread.replyStatus,
            lastError: activeReplySession.lastError?.message ?? thread.lastError,
          };
        }),
      };

    case 'RESOLVE_THREAD_REPLY':
      return {
        ...state,
        localThreads: updateLocalThread(
          state.localThreads,
          action.thread.localThreadId,
          () => action.thread,
        ),
      };

    case 'ADD_LOCAL_THREAD':
      return {
        ...state,
        reviewStatus:
          state.reviewStatus === 'idle' || state.reviewStatus === 'failed'
            ? 'showing_local_threads'
            : state.reviewStatus,
        localThreads: [
          ...state.localThreads.filter(
            (thread) => thread.localThreadId !== action.thread.localThreadId,
          ),
          action.thread,
        ],
      };

    case 'FAIL_THREAD_REPLY':
      return {
        ...state,
        localThreads: updateLocalThread(state.localThreads, action.localThreadId, (thread) => ({
          ...thread,
          replyStatus: 'failed',
          lastError: action.errorMessage,
        })),
      };

    case 'FAIL': {
      const failedRun = action.run ?? state.latestRun;

      return {
        ...state,
        reviewStatus: 'failed',
        latestRun:
          failedRun === null
            ? null
            : {
                ...failedRun,
                status: 'failed',
              },
        summary: null,
        localThreads: [],
        fallbackRichText: null,
        fallbackReason: null,
        errorMessage: action.errorMessage,
      };
    }

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function isReviewDraftRunning(state: ReviewDraftState): boolean {
  return state.reviewStatus === 'drafting_review';
}
