import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import type {
  ReviewPublishDraft,
  ReviewPublishResult,
} from '../../../shared/domain/review-publish';

export type ReviewPublishStatus =
  | 'idle'
  | 'awaiting_approval'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface ReviewPublishState {
  publishStatus: ReviewPublishStatus;
  drafts: ReviewPublishDraft[];
  selectedDraftIds: string[];
  errorMessage: string | null;
  lastResult: ReviewPublishResult | null;
  isPanelOpen: boolean;
}

export type ReviewPublishAction =
  | { type: 'OPEN_PANEL'; drafts: ReviewPublishDraft[] }
  | { type: 'CLOSE_PANEL' }
  | { type: 'UPDATE_DRAFTS'; drafts: ReviewPublishDraft[] }
  | { type: 'SET_ERROR_MESSAGE'; errorMessage: string }
  | { type: 'SET_SELECTED_IDS'; ids: string[] }
  | { type: 'BEGIN_PUBLISH' }
  | {
      type: 'PUBLISH_SUCCESS';
      result: ReviewPublishResult;
      updatedDrafts: ReviewPublishDraft[];
      remoteThreads: ReviewSnapshotThread[];
    }
  | {
      type: 'PUBLISH_PARTIAL';
      result: ReviewPublishResult;
      updatedDrafts: ReviewPublishDraft[];
    }
  | { type: 'PUBLISH_FAIL'; errorMessage: string }
  | { type: 'RESET' };

export function createInitialReviewPublishState(): ReviewPublishState {
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

export function reduceReviewPublishState(
  state: ReviewPublishState,
  action: ReviewPublishAction,
): ReviewPublishState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return {
        ...state,
        isPanelOpen: true,
        publishStatus: 'awaiting_approval',
        drafts: action.drafts,
        selectedDraftIds: selectableDraftIds(action.drafts),
        errorMessage: null,
      };

    case 'CLOSE_PANEL':
      return {
        ...state,
        isPanelOpen: false,
        publishStatus: state.publishStatus === 'awaiting_approval' ? 'idle' : state.publishStatus,
      };

    case 'UPDATE_DRAFTS': {
      const allowedDraftIds = new Set(selectableDraftIds(action.drafts));
      const selectedDraftIds = state.selectedDraftIds.filter((id) => allowedDraftIds.has(id));
      return {
        ...state,
        drafts: action.drafts,
        selectedDraftIds,
        errorMessage: null,
      };
    }

    case 'SET_ERROR_MESSAGE':
      return {
        ...state,
        errorMessage: action.errorMessage,
      };

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
        drafts: action.updatedDrafts,
        selectedDraftIds: selectableDraftIds(action.updatedDrafts),
        lastResult: action.result,
        errorMessage: null,
        isPanelOpen: false,
      };

    case 'PUBLISH_PARTIAL':
      return {
        ...state,
        publishStatus: 'failed',
        drafts: action.updatedDrafts,
        selectedDraftIds: selectableDraftIds(action.updatedDrafts),
        lastResult: action.result,
        errorMessage: `${action.result.failedCount} 件の投稿に失敗しました。`,
        isPanelOpen: true,
      };

    case 'PUBLISH_FAIL':
      return {
        ...state,
        publishStatus: 'failed',
        errorMessage: action.errorMessage,
      };

    case 'RESET':
      return createInitialReviewPublishState();

    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown publish action: ${(exhaustive as { type: string }).type}`);
    }
  }
}
