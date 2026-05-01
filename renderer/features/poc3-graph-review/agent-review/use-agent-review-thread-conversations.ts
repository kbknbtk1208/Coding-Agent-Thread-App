'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  AgentEventPayload,
  AgentSessionSnapshot,
} from '../../../../shared/contracts/agent-ipc';
import type {
  Poc3AgentThreadConversation,
  Poc3AgentThreadMessage,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import {
  mergeAppSessionSnapshot,
  normalizeAppSession,
} from '../../../components/session-event-state';

export type Poc3AgentThreadConversationView = Poc3AgentThreadConversation & {
  activeReplySession: AgentSessionSnapshot | null;
};

interface AgentThreadConversationState {
  conversationsByThread: Record<string, Poc3AgentThreadConversationView>;
  draftReplyByThread: Record<string, string>;
  optimisticReplyByThread: Record<string, true>;
}

type AgentThreadConversationAction =
  | { type: 'RESET' }
  | { type: 'HYDRATE'; conversations: Poc3AgentThreadConversation[] }
  | { type: 'UPSERT_CONVERSATION'; conversation: Poc3AgentThreadConversation }
  | { type: 'OPTIMISTIC_REPLY'; localThreadId: string }
  | {
      type: 'BEGIN_REPLY';
      conversation: Poc3AgentThreadConversation;
      session: AgentSessionSnapshot;
      userMessage?: Poc3AgentThreadMessage;
    }
  | {
      type: 'APPLY_SESSION_EVENT';
      localThreadId: string;
      session: AgentSessionSnapshot;
      agentEvent?: AgentEventPayload;
    }
  | { type: 'RESOLVE_REPLY'; conversation: Poc3AgentThreadConversation }
  | { type: 'FAIL_REPLY'; localThreadId: string; errorMessage: string }
  | { type: 'SET_DRAFT'; localThreadId: string; body: string }
  | { type: 'CLEAR_DRAFT'; localThreadId: string };

export interface UseAgentReviewThreadConversationsOptions {
  reviewWorkspaceId: string | null;
  revisionId: string | null;
}

export interface UseAgentReviewThreadConversationsReturn {
  conversations: Record<string, Poc3AgentThreadConversationView>;
  draftReplies: Record<string, string>;
  hydrate: (reviewWorkspaceId: string, revisionId: string) => Promise<void>;
  isReplyPending: (localThreadId: string) => boolean;
  loadOne: (localThreadId: string) => Promise<void>;
  setDraftReply: (localThreadId: string, body: string) => void;
  submitReply: (localThreadId: string) => Promise<void>;
}

const initialState: AgentThreadConversationState = {
  conversationsByThread: {},
  draftReplyByThread: {},
  optimisticReplyByThread: {},
};

function toConversationView(
  conversation: Poc3AgentThreadConversation,
  activeReplySession: AgentSessionSnapshot | null = null,
): Poc3AgentThreadConversationView {
  return {
    ...conversation,
    activeReplySession,
  };
}

function upsertConversation(
  state: AgentThreadConversationState,
  conversation: Poc3AgentThreadConversation,
  activeReplySession?: AgentSessionSnapshot | null,
): AgentThreadConversationState {
  const existing = state.conversationsByThread[conversation.localThreadId];
  return {
    ...state,
    conversationsByThread: {
      ...state.conversationsByThread,
      [conversation.localThreadId]: toConversationView(
        conversation,
        activeReplySession === undefined
          ? (existing?.activeReplySession ?? null)
          : activeReplySession,
      ),
    },
  };
}

function reduceAgentThreadConversationState(
  state: AgentThreadConversationState,
  action: AgentThreadConversationAction,
): AgentThreadConversationState {
  switch (action.type) {
    case 'RESET':
      return initialState;

    case 'HYDRATE': {
      const conversationsByThread: Record<string, Poc3AgentThreadConversationView> = {};
      for (const conversation of action.conversations) {
        const isOptimisticReplying =
          state.optimisticReplyByThread[conversation.localThreadId] === true;
        const existing = state.conversationsByThread[conversation.localThreadId];
        const hydratedConversation = isOptimisticReplying
          ? {
              ...conversation,
              replyStatus: 'replying' as const,
              lastError: null,
            }
          : conversation;
        const shouldKeepActiveReplySession =
          existing?.activeReplySession &&
          (isOptimisticReplying ||
            hydratedConversation.replyStatus === 'replying' ||
            hydratedConversation.activeReplySessionId === existing.activeReplySession.appSessionId);
        conversationsByThread[conversation.localThreadId] = toConversationView(
          hydratedConversation,
          shouldKeepActiveReplySession ? existing.activeReplySession : null,
        );
      }
      return {
        conversationsByThread,
        draftReplyByThread: state.draftReplyByThread,
        optimisticReplyByThread: state.optimisticReplyByThread,
      };
    }

    case 'UPSERT_CONVERSATION':
      return upsertConversation(state, action.conversation);

    case 'OPTIMISTIC_REPLY': {
      const existing = state.conversationsByThread[action.localThreadId];
      return {
        ...state,
        conversationsByThread: existing
          ? {
              ...state.conversationsByThread,
              [action.localThreadId]: {
                ...existing,
                replyStatus: 'replying',
                lastError: null,
              },
            }
          : state.conversationsByThread,
        optimisticReplyByThread: {
          ...state.optimisticReplyByThread,
          [action.localThreadId]: true,
        },
      };
    }

    case 'BEGIN_REPLY': {
      const conversation = action.userMessage
        ? {
            ...action.conversation,
            messages: ensureMessagePresent(action.conversation.messages, action.userMessage),
          }
        : action.conversation;
      const { [conversation.localThreadId]: _cleared, ...optimisticReplyByThread } =
        state.optimisticReplyByThread;
      return {
        ...upsertConversation(state, conversation, normalizeAppSession(action.session)),
        optimisticReplyByThread,
      };
    }

    case 'APPLY_SESSION_EVENT': {
      const existing = state.conversationsByThread[action.localThreadId];
      if (!existing) {
        return state;
      }
      if (
        existing.activeReplySessionId &&
        action.session.appSessionId !== existing.activeReplySessionId
      ) {
        return state;
      }

      const activeReplySession = mergeAppSessionSnapshot(
        existing.activeReplySession ?? undefined,
        normalizeAppSession(action.session),
      );

      return {
        ...state,
        conversationsByThread: {
          ...state.conversationsByThread,
          [action.localThreadId]: {
            ...existing,
            activeReplySessionId: activeReplySession.appSessionId,
            activeReplySession,
            replyStatus: activeReplySession.status === 'failed' ? 'failed' : existing.replyStatus,
            lastError: activeReplySession.lastError?.message ?? existing.lastError,
          },
        },
      };
    }

    case 'RESOLVE_REPLY': {
      const { [action.conversation.localThreadId]: _cleared, ...optimisticReplyByThread } =
        state.optimisticReplyByThread;
      return {
        ...upsertConversation(state, action.conversation, null),
        optimisticReplyByThread,
      };
    }

    case 'FAIL_REPLY': {
      const existing = state.conversationsByThread[action.localThreadId];
      const { [action.localThreadId]: _cleared, ...optimisticReplyByThread } =
        state.optimisticReplyByThread;
      if (!existing) {
        return {
          ...state,
          optimisticReplyByThread,
        };
      }
      return {
        ...state,
        optimisticReplyByThread,
        conversationsByThread: {
          ...state.conversationsByThread,
          [action.localThreadId]: {
            ...existing,
            replyStatus: 'failed',
            lastError: action.errorMessage,
          },
        },
      };
    }

    case 'SET_DRAFT':
      return {
        ...state,
        draftReplyByThread: {
          ...state.draftReplyByThread,
          [action.localThreadId]: action.body,
        },
      };

    case 'CLEAR_DRAFT': {
      const { [action.localThreadId]: _cleared, ...draftReplyByThread } = state.draftReplyByThread;
      return {
        ...state,
        draftReplyByThread,
      };
    }

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function ensureMessagePresent(messages: Poc3AgentThreadMessage[], message: Poc3AgentThreadMessage) {
  if (messages.some((candidate) => candidate.localMessageId === message.localMessageId)) {
    return messages;
  }
  return [...messages, message];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'スレッド返信の実行に失敗しました。';
}

function resultMessage(result: { message?: string }, fallback: string) {
  return result.message?.trim() || fallback;
}

export function useAgentReviewThreadConversations({
  reviewWorkspaceId,
  revisionId,
}: UseAgentReviewThreadConversationsOptions): UseAgentReviewThreadConversationsReturn {
  const [state, dispatch] = useReducer(reduceAgentThreadConversationState, initialState);
  const stateRef = useRef(state);
  const requestIdByThreadRef = useRef(new Map<string, number>());
  const workspaceKeyRef = useRef<string | null>(null);
  stateRef.current = state;

  const hydrate = useCallback(async (workspaceId: string, targetRevisionId: string) => {
    const result = await window.poc3GraphReviewApi.listAgentThreadConversations({
      reviewWorkspaceId: workspaceId,
      revisionId: targetRevisionId,
    });
    dispatch({ type: 'HYDRATE', conversations: result.conversations });
  }, []);

  useEffect(() => {
    const workspaceKey =
      reviewWorkspaceId && revisionId ? `${reviewWorkspaceId}:${revisionId}` : null;
    if (workspaceKeyRef.current !== workspaceKey) {
      workspaceKeyRef.current = workspaceKey;
      requestIdByThreadRef.current.clear();
      dispatch({ type: 'RESET' });
    }
    if (!reviewWorkspaceId || !revisionId) {
      return;
    }

    let disposed = false;
    void window.poc3GraphReviewApi
      .listAgentThreadConversations({ reviewWorkspaceId, revisionId })
      .then((result) => {
        if (!disposed) {
          dispatch({ type: 'HYDRATE', conversations: result.conversations });
        }
      })
      .catch((error: unknown) => {
        console.error('[poc3-agent-thread] Failed to hydrate conversations:', error);
        if (!disposed) {
          dispatch({ type: 'HYDRATE', conversations: [] });
        }
      });

    return () => {
      disposed = true;
    };
  }, [reviewWorkspaceId, revisionId]);

  useEffect(() => {
    if (!reviewWorkspaceId || !revisionId) {
      return;
    }

    const unsubscribe = window.poc3GraphReviewApi.onAgentReviewEvent((event) => {
      if (
        event.type === 'agent-review.thread-reply.started' &&
        event.binding.reviewWorkspaceId === reviewWorkspaceId &&
        event.binding.revisionId === revisionId
      ) {
        dispatch({ type: 'UPSERT_CONVERSATION', conversation: event.conversation });
        return;
      }

      if (
        event.type === 'agent-review.thread-reply.session' &&
        event.reviewWorkspaceId === reviewWorkspaceId &&
        event.revisionId === revisionId
      ) {
        dispatch({
          type: 'APPLY_SESSION_EVENT',
          localThreadId: event.localThreadId,
          session: event.session,
          agentEvent: event.agentEvent,
        });
        return;
      }

      if (
        event.type === 'agent-review.thread-reply.completed' &&
        event.reviewWorkspaceId === reviewWorkspaceId &&
        event.revisionId === revisionId
      ) {
        dispatch({ type: 'RESOLVE_REPLY', conversation: event.conversation });
        return;
      }

      if (
        event.type === 'agent-review.thread-reply.failed' &&
        event.reviewWorkspaceId === reviewWorkspaceId &&
        event.revisionId === revisionId
      ) {
        dispatch({
          type: 'FAIL_REPLY',
          localThreadId: event.localThreadId,
          errorMessage: event.message,
        });
      }
    });

    return unsubscribe;
  }, [reviewWorkspaceId, revisionId]);

  const loadOne = useCallback(
    async (localThreadId: string) => {
      if (!reviewWorkspaceId) {
        return;
      }
      const result = await window.poc3GraphReviewApi.loadAgentThreadConversation({
        reviewWorkspaceId,
        localThreadId,
      });
      if (result.ok) {
        dispatch({ type: 'UPSERT_CONVERSATION', conversation: result.conversation });
      }
    },
    [reviewWorkspaceId],
  );

  const setDraftReply = useCallback((localThreadId: string, body: string) => {
    stateRef.current = {
      ...stateRef.current,
      draftReplyByThread: {
        ...stateRef.current.draftReplyByThread,
        [localThreadId]: body,
      },
    };
    dispatch({ type: 'SET_DRAFT', localThreadId, body });
  }, []);

  const isReplyPending = useCallback((localThreadId: string) => {
    const current = stateRef.current;
    return (
      current.optimisticReplyByThread[localThreadId] === true ||
      current.conversationsByThread[localThreadId]?.replyStatus === 'replying'
    );
  }, []);

  const submitReply = useCallback(
    async (localThreadId: string) => {
      if (!reviewWorkspaceId || !revisionId) {
        return;
      }

      const currentState = stateRef.current;
      const body = (currentState.draftReplyByThread[localThreadId] ?? '').trim();
      if (!body) {
        return;
      }

      const existing = currentState.conversationsByThread[localThreadId];
      if (
        existing?.replyStatus === 'replying' ||
        currentState.optimisticReplyByThread[localThreadId] === true
      ) {
        return;
      }

      const requestId = (requestIdByThreadRef.current.get(localThreadId) ?? 0) + 1;
      requestIdByThreadRef.current.set(localThreadId, requestId);
      stateRef.current = {
        ...stateRef.current,
        optimisticReplyByThread: {
          ...stateRef.current.optimisticReplyByThread,
          [localThreadId]: true,
        },
      };
      dispatch({ type: 'OPTIMISTIC_REPLY', localThreadId });

      try {
        const begun = await window.poc3GraphReviewApi.beginAgentReviewThreadReply({
          reviewWorkspaceId,
          revisionId,
          localThreadId,
          body,
        });

        if (requestIdByThreadRef.current.get(localThreadId) !== requestId) {
          return;
        }

        if (!begun.ok) {
          dispatch({
            type: 'FAIL_REPLY',
            localThreadId,
            errorMessage: resultMessage(begun, 'スレッド返信を開始できませんでした。'),
          });
          return;
        }

        dispatch({
          type: 'BEGIN_REPLY',
          conversation: begun.conversation,
          session: begun.session,
          userMessage: begun.userMessage,
        });
        dispatch({ type: 'CLEAR_DRAFT', localThreadId });

        const settled = await window.poc3GraphReviewApi.awaitAgentReviewThreadReplyResult({
          replyId: begun.reply.replyId,
        });

        if (requestIdByThreadRef.current.get(localThreadId) !== requestId) {
          return;
        }

        if (settled.ok) {
          dispatch({ type: 'RESOLVE_REPLY', conversation: settled.conversation });
        } else {
          dispatch({
            type: 'FAIL_REPLY',
            localThreadId,
            errorMessage: resultMessage(settled, 'スレッド返信の完了待ちに失敗しました。'),
          });
        }
      } catch (error: unknown) {
        if (requestIdByThreadRef.current.get(localThreadId) === requestId) {
          dispatch({
            type: 'FAIL_REPLY',
            localThreadId,
            errorMessage: toErrorMessage(error),
          });
        }
      }
    },
    [reviewWorkspaceId, revisionId],
  );

  return useMemo(
    () => ({
      conversations: state.conversationsByThread,
      draftReplies: state.draftReplyByThread,
      hydrate,
      isReplyPending,
      loadOne,
      setDraftReply,
      submitReply,
    }),
    [
      hydrate,
      isReplyPending,
      loadOne,
      setDraftReply,
      state.conversationsByThread,
      state.draftReplyByThread,
      state.optimisticReplyByThread,
      submitReply,
    ],
  );
}
