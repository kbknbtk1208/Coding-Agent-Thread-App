import type { AgentEvent, AppSession } from '../../../shared/domain/agent';
import type {
  ReviewDraftEnvelope,
  ReviewDraftFallbackReason,
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadDraft,
} from '../../../shared/domain/review-draft';
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
  localDraftThreads: ReviewThreadDraft[];
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
      type: 'FAIL';
      errorMessage: string;
      run?: ReviewRunRecord | null;
    };

export function createInitialReviewDraftState(): ReviewDraftState {
  return {
    reviewStatus: 'idle',
    latestRun: null,
    summary: null,
    localDraftThreads: [],
    fallbackRichText: null,
    fallbackReason: null,
    errorMessage: null,
    activeRunSessionId: null,
    activeRunSession: null,
  };
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
        localDraftThreads: [],
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
        localDraftThreads: action.envelope.threads,
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
        localDraftThreads: [],
        fallbackRichText: action.envelope.content,
        fallbackReason: action.envelope.reason,
        errorMessage: null,
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
        localDraftThreads: [],
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
