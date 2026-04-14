import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { BeginDraftReviewInput } from '../../../shared/contracts/review-ipc';
import type { ReviewLocalThread, ReviewRunRecord } from '../../../shared/domain/review-draft';
import {
  createInitialReviewDraftState,
  isReviewDraftRunning,
  type ReviewDraftState,
  reduceReviewDraftState,
} from './review-draft-state';
import { useReviewThreadConversations } from './use-review-thread-conversations';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'レビュー草案の実行に失敗しました。';
}

export interface UseReviewDraftReturn {
  reviewDraftState: ReviewDraftState;
  isRunning: boolean;
  startDraftReview: (input: BeginDraftReviewInput) => Promise<ReviewRunRecord | null>;
  replyToLocalThread: (localThreadId: string, body: string) => Promise<void>;
  respondToThreadPermission: (
    localThreadId: string,
    requestId: string,
    actionId: string,
  ) => Promise<void>;
  addLocalThread: (thread: ReviewLocalThread) => void;
  resetReviewDraftState: () => void;
}

export function useReviewDraft(): UseReviewDraftReturn {
  const [state, dispatch] = useReducer(reduceReviewDraftState, createInitialReviewDraftState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestIdRef = useRef(0);
  const inFlightRequestIdRef = useRef<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const threadConversations = useReviewThreadConversations({
    dispatch,
    stateRef,
  });
  const { replyToLocalThread, respondToThreadPermission, resetThreadConversationState } =
    threadConversations;

  const cleanupSubscription = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const resetReviewDraftState = useCallback(() => {
    requestIdRef.current += 1;
    inFlightRequestIdRef.current = null;
    cleanupSubscription();
    resetThreadConversationState();
    dispatch({ type: 'RESET' });
  }, [cleanupSubscription, resetThreadConversationState]);

  const addLocalThread = useCallback((thread: ReviewLocalThread) => {
    dispatch({ type: 'ADD_LOCAL_THREAD', thread });
  }, []);

  const startDraftReview = useCallback(
    async (input: BeginDraftReviewInput) => {
      if (inFlightRequestIdRef.current !== null || isReviewDraftRunning(stateRef.current)) {
        return null;
      }

      const snapshotId = input.snapshotId.trim();
      if (!snapshotId) {
        dispatch({
          type: 'FAIL',
          errorMessage: 'snapshotId が必要です。',
        });
        return null;
      }

      const requestId = ++requestIdRef.current;
      inFlightRequestIdRef.current = requestId;
      cleanupSubscription();
      resetThreadConversationState();
      dispatch({ type: 'START' });

      let activeRun: ReviewRunRecord | null = null;
      let activeRunSessionId: string | null = null;

      try {
        const begun = await window.reviewApi.beginDraftReview({
          ...input,
          snapshotId,
        });

        if (requestId !== requestIdRef.current) {
          return null;
        }

        activeRun = begun.run;
        activeRunSessionId = begun.run.rootAppSessionId;
        dispatch({
          type: 'BEGIN',
          run: begun.run,
          session: begun.session,
        });

        const unsubscribe = window.agentApi.onAgentEvent((event) => {
          if (requestId !== requestIdRef.current || event.appSessionId !== activeRunSessionId) {
            return;
          }

          dispatch({
            type: 'APPLY_ACTIVE_SESSION_EVENT',
            event,
          });
        });
        unsubscribeRef.current = unsubscribe;

        void (async () => {
          try {
            const sessions = await window.agentApi.listSessions();
            if (requestId === requestIdRef.current) {
              const activeSession = sessions.find(
                (session) => session.appSessionId === activeRunSessionId,
              );
              if (activeSession) {
                dispatch({
                  type: 'SYNC_ACTIVE_SESSION',
                  session: activeSession,
                });
              }
            }

            const result = await window.reviewApi.awaitDraftReviewResult({
              runId: begun.run.runId,
            });

            if (requestId !== requestIdRef.current) {
              return;
            }

            if (result.result.kind === 'structured') {
              dispatch({
                type: 'RESOLVE_STRUCTURED',
                envelope: result.result,
              });
            } else {
              dispatch({
                type: 'RESOLVE_FALLBACK',
                envelope: result.result,
              });
            }
          } catch (error: unknown) {
            if (requestId === requestIdRef.current) {
              dispatch({
                type: 'FAIL',
                errorMessage: toErrorMessage(error),
                run: begun.run,
              });
            }
          } finally {
            if (inFlightRequestIdRef.current === requestId) {
              inFlightRequestIdRef.current = null;
            }
            if (unsubscribeRef.current === unsubscribe) {
              unsubscribe();
              unsubscribeRef.current = null;
            }
          }
        })();

        return begun.run;
      } catch (error: unknown) {
        if (requestId === requestIdRef.current) {
          dispatch({
            type: 'FAIL',
            errorMessage: toErrorMessage(error),
            run: activeRun,
          });
        }

        if (inFlightRequestIdRef.current === requestId) {
          inFlightRequestIdRef.current = null;
        }

        return null;
      }
    },
    [cleanupSubscription, resetThreadConversationState],
  );

  return useMemo(
    () => ({
      reviewDraftState: state,
      isRunning: isReviewDraftRunning(state),
      startDraftReview,
      replyToLocalThread,
      respondToThreadPermission,
      addLocalThread,
      resetReviewDraftState,
    }),
    [
      addLocalThread,
      replyToLocalThread,
      resetReviewDraftState,
      respondToThreadPermission,
      startDraftReview,
      state,
    ],
  );
}
