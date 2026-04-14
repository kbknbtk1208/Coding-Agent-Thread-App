import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import type { ReviewPublishDraft } from '../../../shared/domain/review-publish';
import {
  createInitialReviewPublishState,
  reduceReviewPublishState,
  type ReviewPublishState,
} from './review-publish-state';

export type { ReviewPublishState };

export interface UseReviewPublishReturn {
  publishState: ReviewPublishState;
  openPanel: (snapshotId: string) => Promise<void>;
  closePanel: () => void;
  updateDraft: (draft: ReviewPublishDraft, snapshotId: string) => Promise<void>;
  toggleDraftSelection: (publishDraftId: string) => void;
  confirmPublish: (snapshotId: string) => Promise<ReviewSnapshotThread[]>;
  reset: () => void;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return '投稿処理に失敗しました。';
}

function inferProviderFromThread(thread: ReviewSnapshotThread): 'github' | 'gitlab' {
  return thread.threadId.startsWith('gitlab-') ? 'gitlab' : 'github';
}

export function useReviewPublish(): UseReviewPublishReturn {
  const [state, dispatch] = useReducer(reduceReviewPublishState, createInitialReviewPublishState());
  const stateRef = useRef(state);
  stateRef.current = state;

  const openPanel = useCallback(async (snapshotId: string) => {
    if (stateRef.current.publishStatus === 'publishing') {
      return;
    }
    try {
      const result = await window.reviewApi.preparePublishDrafts({ snapshotId });
      dispatch({ type: 'OPEN_PANEL', drafts: result.drafts });
    } catch (err: unknown) {
      dispatch({ type: 'PUBLISH_FAIL', errorMessage: toErrorMessage(err) });
    }
  }, []);

  const closePanel = useCallback(() => {
    if (stateRef.current.publishStatus === 'publishing') {
      return;
    }
    dispatch({ type: 'CLOSE_PANEL' });
  }, []);

  const updateDraft = useCallback(async (draft: ReviewPublishDraft, snapshotId: string) => {
    if (stateRef.current.publishStatus === 'publishing') {
      return;
    }
    const updatedDrafts = stateRef.current.drafts.map((d) =>
      d.publishDraftId === draft.publishDraftId ? draft : d,
    );
    dispatch({ type: 'UPDATE_DRAFTS', drafts: updatedDrafts });
    try {
      const result = await window.reviewApi.updatePublishDrafts({
        snapshotId,
        drafts: updatedDrafts,
      });
      dispatch({ type: 'UPDATE_DRAFTS', drafts: result.drafts });
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR_MESSAGE', errorMessage: toErrorMessage(err) });
    }
  }, []);

  const toggleDraftSelection = useCallback((publishDraftId: string) => {
    const currentState = stateRef.current;
    if (currentState.publishStatus === 'publishing') {
      return;
    }
    dispatch({
      type: 'SET_SELECTED_IDS',
      ids: currentState.selectedDraftIds.includes(publishDraftId)
        ? currentState.selectedDraftIds.filter((id) => id !== publishDraftId)
        : [...currentState.selectedDraftIds, publishDraftId],
    });
  }, []);

  const confirmPublish = useCallback(
    async (snapshotId: string): Promise<ReviewSnapshotThread[]> => {
      const currentState = stateRef.current;
      if (
        currentState.publishStatus === 'publishing' ||
        currentState.selectedDraftIds.length === 0
      ) {
        return [];
      }

      dispatch({ type: 'BEGIN_PUBLISH' });

      try {
        const persisted = await window.reviewApi.updatePublishDrafts({
          snapshotId,
          drafts: currentState.drafts,
        });
        dispatch({ type: 'UPDATE_DRAFTS', drafts: persisted.drafts });

        const result = await window.reviewApi.publishDrafts({
          snapshotId,
          publishDraftIds: currentState.selectedDraftIds,
        });

        const updatedDrafts = persisted.drafts.map((d) => {
          const item = result.result.items.find((i) => i.publishDraftId === d.publishDraftId);
          if (!item) return d;
          if (item.status === 'published') {
            return {
              ...d,
              state: 'published' as const,
              lastError: null,
              publishedRemote: item.remoteThread
                ? {
                    provider: inferProviderFromThread(item.remoteThread),
                    remoteDiscussionId: item.remoteThread.providerContext.remoteDiscussionId,
                    remoteCommentIds: [...item.remoteThread.providerContext.remoteCommentIds],
                    publishedAt: new Date().toISOString(),
                  }
                : d.publishedRemote,
            };
          }
          return {
            ...d,
            state: 'failed' as const,
            lastError: item.errorMessage ?? 'Unknown error',
          };
        });

        const remoteThreads = result.result.items
          .filter((i) => i.status === 'published' && i.remoteThread)
          .map((i) => i.remoteThread as ReviewSnapshotThread);

        if (result.result.failedCount === 0) {
          dispatch({
            type: 'PUBLISH_SUCCESS',
            result: result.result,
            updatedDrafts,
            remoteThreads,
          });
        } else {
          dispatch({ type: 'PUBLISH_PARTIAL', result: result.result, updatedDrafts });
        }

        return remoteThreads;
      } catch (err: unknown) {
        dispatch({ type: 'PUBLISH_FAIL', errorMessage: toErrorMessage(err) });
        return [];
      }
    },
    [],
  );

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return useMemo(
    () => ({
      publishState: state,
      openPanel,
      closePanel,
      updateDraft,
      toggleDraftSelection,
      confirmPublish,
      reset,
    }),
    [state, openPanel, closePanel, updateDraft, toggleDraftSelection, confirmPublish, reset],
  );
}
