import type { Dispatch, MutableRefObject } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import type { ReviewThreadMessage } from '../../../shared/domain/review-draft';
import type { ReviewDraftAction, ReviewDraftState } from './review-draft-state';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'スレッド返信の実行に失敗しました。';
}

interface UseReviewThreadConversationsOptions {
  dispatch: Dispatch<ReviewDraftAction>;
  stateRef: MutableRefObject<ReviewDraftState>;
}

export interface UseReviewThreadConversationsReturn {
  replyToLocalThread: (localThreadId: string, body: string) => Promise<void>;
  respondToThreadPermission: (
    localThreadId: string,
    requestId: string,
    actionId: string,
  ) => Promise<void>;
  resetThreadConversationState: () => void;
}

export function useReviewThreadConversations({
  dispatch,
  stateRef,
}: UseReviewThreadConversationsOptions): UseReviewThreadConversationsReturn {
  const requestIdByThreadRef = useRef(new Map<string, number>());
  const unsubscribeByThreadRef = useRef(new Map<string, () => void>());

  const cleanupThreadSubscription = useCallback((localThreadId: string) => {
    const unsubscribe = unsubscribeByThreadRef.current.get(localThreadId);
    if (!unsubscribe) {
      return;
    }

    unsubscribe();
    unsubscribeByThreadRef.current.delete(localThreadId);
  }, []);

  const resetThreadConversationState = useCallback(() => {
    for (const localThreadId of Array.from(unsubscribeByThreadRef.current.keys())) {
      cleanupThreadSubscription(localThreadId);
    }
    requestIdByThreadRef.current.clear();
  }, [cleanupThreadSubscription]);

  const replyToLocalThread = useCallback(
    async (localThreadId: string, body: string) => {
      const trimmedBody = body.trim();
      if (!trimmedBody) {
        return;
      }

      const currentState = stateRef.current;
      const thread = currentState.localThreads.find(
        (candidate) => candidate.localThreadId === localThreadId,
      );
      if (!thread || thread.replyStatus === 'replying') {
        return;
      }

      const requestId = (requestIdByThreadRef.current.get(localThreadId) ?? 0) + 1;
      requestIdByThreadRef.current.set(localThreadId, requestId);
      cleanupThreadSubscription(localThreadId);

      try {
        const begun = await window.reviewApi.beginDraftThreadReply({
          snapshotId: thread.snapshotId,
          localThreadId,
          body: trimmedBody,
        });

        if (requestIdByThreadRef.current.get(localThreadId) !== requestId) {
          return;
        }

        const userMessage: ReviewThreadMessage = {
          localMessageId: begun.reply.userMessageId,
          localThreadId,
          role: 'user',
          source: 'user-reply',
          body: trimmedBody,
          createdAt: begun.reply.createdAt,
        };

        dispatch({
          type: 'BEGIN_THREAD_REPLY',
          localThreadId,
          reply: begun.reply,
          binding: begun.binding,
          session: begun.session,
          userMessage,
        });

        const unsubscribe = window.agentApi.onAgentEvent((event) => {
          if (requestIdByThreadRef.current.get(localThreadId) !== requestId) {
            return;
          }
          if (event.appSessionId !== begun.reply.appSessionId) {
            return;
          }

          dispatch({
            type: 'APPLY_THREAD_SESSION_EVENT',
            localThreadId,
            event,
          });
        });
        unsubscribeByThreadRef.current.set(localThreadId, unsubscribe);

        const sessions = await window.agentApi.listSessions();
        if (requestIdByThreadRef.current.get(localThreadId) === requestId) {
          const activeSession = sessions.find(
            (session) => session.appSessionId === begun.reply.appSessionId,
          );
          if (activeSession) {
            dispatch({
              type: 'SYNC_THREAD_SESSION',
              localThreadId,
              session: activeSession,
            });
          }
        }

        const result = await window.reviewApi.awaitDraftThreadReplyResult({
          replyId: begun.reply.replyId,
        });
        if (requestIdByThreadRef.current.get(localThreadId) !== requestId) {
          return;
        }

        dispatch({
          type: 'RESOLVE_THREAD_REPLY',
          thread: result.thread,
        });
      } catch (error: unknown) {
        if (requestIdByThreadRef.current.get(localThreadId) === requestId) {
          dispatch({
            type: 'FAIL_THREAD_REPLY',
            localThreadId,
            errorMessage: toErrorMessage(error),
          });
        }
      } finally {
        if (requestIdByThreadRef.current.get(localThreadId) === requestId) {
          cleanupThreadSubscription(localThreadId);
        }
      }
    },
    [cleanupThreadSubscription, dispatch, stateRef],
  );

  const respondToThreadPermission = useCallback(
    async (localThreadId: string, requestId: string, actionId: string) => {
      const thread = stateRef.current.localThreads.find(
        (candidate) => candidate.localThreadId === localThreadId,
      );
      if (!thread?.activeReplySessionId) {
        return;
      }

      try {
        await window.agentApi.respondPermission({
          appSessionId: thread.activeReplySessionId,
          requestId,
          actionId,
        });
      } catch (error: unknown) {
        console.error('[respondToThreadPermission] Failed to respond:', error);
      }
    },
    [stateRef],
  );

  return useMemo(
    () => ({
      replyToLocalThread,
      respondToThreadPermission,
      resetThreadConversationState,
    }),
    [replyToLocalThread, respondToThreadPermission, resetThreadConversationState],
  );
}
