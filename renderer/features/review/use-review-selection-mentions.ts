import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SplitSide } from '@git-diff-view/react';
import type { AgentKind } from '../../../shared/domain/agent';
import type {
  ReviewFindingCategory,
  ReviewFindingConfidence,
  ReviewFindingSeverity,
  ReviewLocalThread,
} from '../../../shared/domain/review-draft';
import type { ReviewMentionThread } from '../../../shared/domain/review-mention';
import {
  applyAgentEventToSession,
  mergeAppSessionSnapshot,
  normalizeAppSession,
} from '../../components/session-event-state';

interface StartSelectionMentionInput {
  snapshotId: string;
  reviewAgent: AgentKind;
  fileId: string;
  startLine: number;
  endLine: number;
  side: SplitSide;
  body: string;
}

interface PromoteDraftValues {
  title: string;
  body: string;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  confidence: ReviewFindingConfidence;
  suggestion?: string;
}

function splitSideToInputSide(side: SplitSide): 'old' | 'new' {
  return side === SplitSide.old ? 'old' : 'new';
}

function upsertThread(
  threads: ReviewMentionThread[],
  nextThread: ReviewMentionThread,
): ReviewMentionThread[] {
  const exists = threads.some((thread) => thread.mentionThreadId === nextThread.mentionThreadId);
  return exists
    ? threads.map((thread) =>
        thread.mentionThreadId === nextThread.mentionThreadId ? nextThread : thread,
      )
    : [...threads, nextThread];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '選択範囲相談に失敗しました。';
}

export function useReviewSelectionMentions() {
  const [threads, setThreads] = useState<ReviewMentionThread[]>([]);
  const [selectedMentionThreadId, setSelectedMentionThreadId] = useState<string | null>(null);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  useEffect(() => {
    const unsubscribe = window.agentApi.onAgentEvent((event) => {
      setThreads((current) =>
        current.map((thread) => {
          if (thread.activeSessionId !== event.appSessionId || thread.activeSession === null) {
            return thread;
          }
          const activeSession = applyAgentEventToSession(thread.activeSession, event);
          return {
            ...thread,
            activeSession,
            replyStatus: activeSession.status === 'failed' ? 'failed' : thread.replyStatus,
            lastError: activeSession.lastError?.message ?? thread.lastError,
          };
        }),
      );
    });
    return unsubscribe;
  }, []);

  const reset = useCallback(() => {
    setThreads([]);
    setSelectedMentionThreadId(null);
    setReplyBodies({});
  }, []);

  const setReplyBody = useCallback((mentionThreadId: string, body: string) => {
    setReplyBodies((current) => ({
      ...current,
      [mentionThreadId]: body,
    }));
  }, []);

  const selectThread = useCallback((mentionThreadId: string) => {
    setSelectedMentionThreadId(mentionThreadId);
  }, []);

  const beginMention = useCallback(async (input: StartSelectionMentionInput) => {
    const body = input.body.trim();
    if (!body) {
      return null;
    }

    try {
      const begun = await window.reviewApi.beginSelectionMention({
        snapshotId: input.snapshotId,
        reviewAgent: input.reviewAgent,
        fileId: input.fileId,
        side: splitSideToInputSide(input.side),
        startLine: input.startLine,
        endLine: input.endLine,
        body,
      });
      setThreads((current) => upsertThread(current, begun.thread));
      setSelectedMentionThreadId(begun.thread.mentionThreadId);

      void window.reviewApi
        .awaitSelectionMentionResult({ mentionId: begun.mention.mentionId })
        .then((result) => {
          setThreads((current) => upsertThread(current, result.thread));
        })
        .catch((error: unknown) => {
          const message = toErrorMessage(error);
          setThreads((current) =>
            current.map((thread) =>
              thread.mentionThreadId === begun.thread.mentionThreadId
                ? { ...thread, replyStatus: 'failed', lastError: message }
                : thread,
            ),
          );
        });

      return begun.thread;
    } catch (error: unknown) {
      console.error('[beginSelectionMention] Failed:', error);
      return null;
    }
  }, []);

  const replyToMention = useCallback(
    async (mentionThreadId: string, body: string) => {
      const replyBody = body.trim();
      if (!replyBody) {
        return;
      }
      const thread = threadsRef.current.find(
        (candidate) => candidate.mentionThreadId === mentionThreadId,
      );
      if (!thread) {
        return;
      }

      setReplyBody(mentionThreadId, '');
      try {
        const begun = await window.reviewApi.beginSelectionMention({
          snapshotId: thread.snapshotId,
          reviewAgent: thread.reviewAgent,
          fileId: thread.selection.fileId,
          side: thread.selection.side,
          startLine: thread.selection.startLine,
          endLine: thread.selection.endLine,
          mentionThreadId,
          body: replyBody,
        });
        setThreads((current) => upsertThread(current, begun.thread));

        void window.reviewApi
          .awaitSelectionMentionResult({ mentionId: begun.mention.mentionId })
          .then((result) => {
            setThreads((current) => upsertThread(current, result.thread));
          })
          .catch((error: unknown) => {
            const message = toErrorMessage(error);
            setThreads((current) =>
              current.map((candidate) =>
                candidate.mentionThreadId === mentionThreadId
                  ? { ...candidate, replyStatus: 'failed', lastError: message }
                  : candidate,
              ),
            );
          });
      } catch (error: unknown) {
        console.error('[selectionMentionReply] Failed:', error);
      }
    },
    [setReplyBody],
  );

  const promoteToDraft = useCallback(
    async (
      mentionThreadId: string,
      values: PromoteDraftValues,
    ): Promise<ReviewLocalThread | null> => {
      const thread = threadsRef.current.find(
        (candidate) => candidate.mentionThreadId === mentionThreadId,
      );
      if (!thread) {
        return null;
      }

      try {
        const result = await window.reviewApi.promoteSelectionMentionToDraft({
          snapshotId: thread.snapshotId,
          mentionThreadId,
          title: values.title,
          body: values.body,
          severity: values.severity,
          category: values.category,
          confidence: values.confidence,
          suggestion: values.suggestion,
        });
        setThreads((current) => upsertThread(current, result.mentionThread));
        return result.draftThread;
      } catch (error: unknown) {
        console.error('[promoteSelectionMentionToDraft] Failed:', error);
        return null;
      }
    },
    [],
  );

  const respondToPermission = useCallback(
    (mentionThreadId: string, requestId: string, actionId: string) => {
      const thread = threadsRef.current.find(
        (candidate) => candidate.mentionThreadId === mentionThreadId,
      );
      if (!thread?.activeSessionId) {
        return;
      }
      void window.agentApi.respondPermission({
        appSessionId: thread.activeSessionId,
        requestId,
        actionId,
      });
    },
    [],
  );

  const syncActiveSession = useCallback(async (mentionThreadId: string) => {
    const thread = threadsRef.current.find(
      (candidate) => candidate.mentionThreadId === mentionThreadId,
    );
    if (!thread?.activeSessionId) {
      return;
    }
    const sessions = await window.agentApi.listSessions();
    const session = sessions.find((candidate) => candidate.appSessionId === thread.activeSessionId);
    if (!session) {
      return;
    }
    setThreads((current) =>
      current.map((candidate) =>
        candidate.mentionThreadId === mentionThreadId
          ? {
              ...candidate,
              activeSession: mergeAppSessionSnapshot(
                candidate.activeSession ?? undefined,
                normalizeAppSession(session),
              ),
            }
          : candidate,
      ),
    );
  }, []);

  return useMemo(
    () => ({
      threads,
      selectedMentionThreadId,
      replyBodies,
      reset,
      beginMention,
      replyToMention,
      promoteToDraft,
      respondToPermission,
      selectThread,
      setReplyBody,
      syncActiveSession,
    }),
    [
      beginMention,
      promoteToDraft,
      replyBodies,
      replyToMention,
      reset,
      respondToPermission,
      selectThread,
      selectedMentionThreadId,
      setReplyBody,
      syncActiveSession,
      threads,
    ],
  );
}
