import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import type {
  ReviewPublishDraft,
  ReviewPublishResult,
} from '../../../shared/domain/review-publish';

export interface ReviewPublishState {
  publishStatus: 'idle' | 'awaiting_approval' | 'publishing' | 'completed' | 'failed';
  drafts: ReviewPublishDraft[];
  selectedDraftIds: string[];
  errorMessage: string | null;
  lastResult: ReviewPublishResult | null;
  isPanelOpen: boolean;
}

type ReviewPublishAction =
  | { type: 'OPEN_PANEL'; drafts: ReviewPublishDraft[] }
  | { type: 'CLOSE_PANEL' }
  | { type: 'UPDATE_DRAFTS'; drafts: ReviewPublishDraft[] }
  | { type: 'SET_SELECTED_IDS'; ids: string[] }
  | { type: 'BEGIN_PUBLISH' }
  | { type: 'PUBLISH_SUCCESS'; result: ReviewPublishResult; drafts: ReviewPublishDraft[] }
  | { type: 'PUBLISH_PARTIAL'; result: ReviewPublishResult; drafts: ReviewPublishDraft[] }
  | { type: 'FAIL'; errorMessage: string }
  | { type: 'RESET' };

function createInitialState(): ReviewPublishState {
  return {
    publishStatus: 'idle',
    drafts: [],
    selectedDraftIds: [],
    errorMessage: null,
    lastResult: null,
    isPanelOpen: false,
  };
}

function selectableDraftIds(drafts: ReviewPublishDraft[]): string[] {
  return drafts.filter((draft) => draft.state !== 'published').map((draft) => draft.publishDraftId);
}

function reducePublishState(
  state: ReviewPublishState,
  action: ReviewPublishAction,
): ReviewPublishState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return {
        ...state,
        publishStatus: 'awaiting_approval',
        drafts: action.drafts,
        selectedDraftIds: selectableDraftIds(action.drafts),
        errorMessage: null,
        isPanelOpen: true,
      };

    case 'CLOSE_PANEL':
      return {
        ...state,
        isPanelOpen: false,
        publishStatus: state.publishStatus === 'awaiting_approval' ? 'idle' : state.publishStatus,
      };

    case 'UPDATE_DRAFTS': {
      const allowedIds = new Set(selectableDraftIds(action.drafts));
      const nextSelectedIds = state.selectedDraftIds.filter((id) => allowedIds.has(id));
      return {
        ...state,
        drafts: action.drafts,
        selectedDraftIds:
          nextSelectedIds.length > 0 ? nextSelectedIds : selectableDraftIds(action.drafts),
      };
    }

    case 'SET_SELECTED_IDS':
      return {
        ...state,
        selectedDraftIds: action.ids,
      };

    case 'BEGIN_PUBLISH':
      return {
        ...state,
        publishStatus: 'publishing',
        errorMessage: null,
      };

    case 'PUBLISH_SUCCESS':
      return {
        ...state,
        publishStatus: 'completed',
        drafts: action.drafts,
        selectedDraftIds: selectableDraftIds(action.drafts),
        lastResult: action.result,
        errorMessage: null,
        isPanelOpen: false,
      };

    case 'PUBLISH_PARTIAL':
      return {
        ...state,
        publishStatus: 'failed',
        drafts: action.drafts,
        selectedDraftIds: selectableDraftIds(action.drafts),
        lastResult: action.result,
        errorMessage: `${action.result.failedCount} 件の投稿に失敗しました。`,
        isPanelOpen: true,
      };

    case 'FAIL':
      return {
        ...state,
        publishStatus: state.isPanelOpen ? 'failed' : state.publishStatus,
        errorMessage: action.errorMessage,
      };

    case 'RESET':
      return createInitialState();

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '投稿処理に失敗しました。';
}

function inferProviderFromThreadId(threadId: string): 'github' | 'gitlab' {
  return threadId.startsWith('gitlab-') ? 'gitlab' : 'github';
}

export interface UseReviewPublishReturn {
  publishState: ReviewPublishState;
  openPanel: (snapshotId: string) => Promise<void>;
  closePanel: () => void;
  updateDraft: (draft: ReviewPublishDraft, snapshotId: string) => Promise<void>;
  toggleDraftSelection: (publishDraftId: string) => void;
  confirmPublish: (snapshotId: string) => Promise<ReviewSnapshotThread[]>;
  reset: () => void;
}

export function useReviewPublish(): UseReviewPublishReturn {
  const [state, dispatch] = useReducer(reducePublishState, createInitialState());
  const stateRef = useRef(state);
  stateRef.current = state;

  const openPanel = useCallback(async (snapshotId: string) => {
    try {
      const result = await window.reviewApi.preparePublishDrafts({ snapshotId });
      dispatch({ type: 'OPEN_PANEL', drafts: result.drafts });
    } catch (error: unknown) {
      dispatch({ type: 'FAIL', errorMessage: toErrorMessage(error) });
    }
  }, []);

  const closePanel = useCallback(() => {
    dispatch({ type: 'CLOSE_PANEL' });
  }, []);

  const updateDraft = useCallback(async (draft: ReviewPublishDraft, snapshotId: string) => {
    const currentDrafts = stateRef.current.drafts.map((candidate) =>
      candidate.publishDraftId === draft.publishDraftId ? draft : candidate,
    );
    dispatch({ type: 'UPDATE_DRAFTS', drafts: currentDrafts });

    try {
      const result = await window.reviewApi.updatePublishDrafts({
        snapshotId,
        drafts: currentDrafts,
      });
      dispatch({ type: 'UPDATE_DRAFTS', drafts: result.drafts });
    } catch (error: unknown) {
      dispatch({ type: 'FAIL', errorMessage: toErrorMessage(error) });
    }
  }, []);

  const toggleDraftSelection = useCallback((publishDraftId: string) => {
    const selectedIds = stateRef.current.selectedDraftIds.includes(publishDraftId)
      ? stateRef.current.selectedDraftIds.filter((id) => id !== publishDraftId)
      : [...stateRef.current.selectedDraftIds, publishDraftId];

    dispatch({
      type: 'SET_SELECTED_IDS',
      ids: selectedIds,
    });
  }, []);

  const confirmPublish = useCallback(
    async (snapshotId: string): Promise<ReviewSnapshotThread[]> => {
      const currentState = stateRef.current;
      if (currentState.selectedDraftIds.length === 0) {
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

        const nextDrafts = persisted.drafts.map((draft) => {
          const item = result.result.items.find(
            (candidate) => candidate.publishDraftId === draft.publishDraftId,
          );
          if (!item) {
            return draft;
          }

          if (item.status === 'published' && item.remoteThread) {
            return {
              ...draft,
              state: 'published' as const,
              lastError: null,
              publishedRemote: {
                provider: inferProviderFromThreadId(item.remoteThread.threadId),
                remoteDiscussionId: item.remoteThread.providerContext.remoteDiscussionId,
                remoteCommentIds: item.remoteThread.providerContext.remoteCommentIds,
                publishedAt: new Date().toISOString(),
              },
            };
          }

          return {
            ...draft,
            state: 'failed' as const,
            lastError: item.errorMessage ?? '投稿に失敗しました。',
          };
        });

        const remoteThreads = result.result.items.flatMap((item) =>
          item.status === 'published' && item.remoteThread ? [item.remoteThread] : [],
        );

        if (result.result.failedCount === 0) {
          dispatch({ type: 'PUBLISH_SUCCESS', result: result.result, drafts: nextDrafts });
        } else {
          dispatch({ type: 'PUBLISH_PARTIAL', result: result.result, drafts: nextDrafts });
        }

        return remoteThreads;
      } catch (error: unknown) {
        dispatch({ type: 'FAIL', errorMessage: toErrorMessage(error) });
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
