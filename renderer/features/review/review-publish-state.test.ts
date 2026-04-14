import { describe, expect, it } from 'vitest';
import type {
  ReviewPublishDraft,
  ReviewPublishResult,
} from '../../../shared/domain/review-publish';
import {
  createInitialReviewPublishState,
  reduceReviewPublishState,
  type ReviewPublishState,
} from './review-publish-state';

function createPublishDraft(overrides: Partial<ReviewPublishDraft> = {}): ReviewPublishDraft {
  return {
    publishDraftId: 'publish-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    localThreadId: 'thread-1',
    sourceKind: 'ai-local-thread',
    title: 'Test finding',
    severity: 'medium',
    body: 'Draft body',
    originalBody: 'Draft body',
    location: { kind: 'overview' },
    anchor: null,
    state: 'ready',
    lastError: null,
    publishedRemote: null,
    updatedAt: '2026-04-06T00:00:00.000Z',
    ...overrides,
  };
}

function createPublishResult(overrides: Partial<ReviewPublishResult> = {}): ReviewPublishResult {
  return {
    snapshotId: 'snapshot-1',
    attemptedCount: 1,
    publishedCount: 1,
    failedCount: 0,
    items: [
      {
        publishDraftId: 'publish-1',
        localThreadId: 'thread-1',
        status: 'published',
      },
    ],
    ...overrides,
  };
}

function openPanel(state: ReviewPublishState, drafts: ReviewPublishDraft[]): ReviewPublishState {
  return reduceReviewPublishState(state, { type: 'OPEN_PANEL', drafts });
}

describe('review publish state reducer', () => {
  it('starts in idle state with no drafts or errors', () => {
    expect(createInitialReviewPublishState()).toEqual({
      publishStatus: 'idle',
      drafts: [],
      selectedDraftIds: [],
      errorMessage: null,
      lastResult: null,
      isPanelOpen: false,
    });
  });

  it('opens panel and selects all non-published drafts by default', () => {
    const initial = createInitialReviewPublishState();
    const draft1 = createPublishDraft({ publishDraftId: 'p-1', state: 'ready' });
    const draft2 = createPublishDraft({ publishDraftId: 'p-2', state: 'published' });

    const next = openPanel(initial, [draft1, draft2]);

    expect(next.isPanelOpen).toBe(true);
    expect(next.publishStatus).toBe('awaiting_approval');
    expect(next.drafts).toEqual([draft1, draft2]);
    expect(next.selectedDraftIds).toEqual(['p-1']);
    expect(next.errorMessage).toBeNull();
  });

  it('closing the panel resets status to idle when in awaiting_approval', () => {
    const initial = createInitialReviewPublishState();
    const withPanel = openPanel(initial, [createPublishDraft()]);

    const closed = reduceReviewPublishState(withPanel, { type: 'CLOSE_PANEL' });

    expect(closed.isPanelOpen).toBe(false);
    expect(closed.publishStatus).toBe('idle');
    expect(closed.drafts).toHaveLength(1);
  });

  it('closing the panel does not change status when already publishing or completed', () => {
    const afterBegin = reduceReviewPublishState(
      openPanel(createInitialReviewPublishState(), [createPublishDraft()]),
      { type: 'BEGIN_PUBLISH' },
    );

    const closed = reduceReviewPublishState(afterBegin, { type: 'CLOSE_PANEL' });

    expect(closed.isPanelOpen).toBe(false);
    expect(closed.publishStatus).toBe('publishing');
  });

  it('replaces the drafts list on UPDATE_DRAFTS', () => {
    const initial = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);
    const updated = reduceReviewPublishState(initial, {
      type: 'UPDATE_DRAFTS',
      drafts: [createPublishDraft({ body: 'Edited body' })],
    });

    expect(updated.drafts[0]?.body).toBe('Edited body');
  });

  it('clears inline errors when drafts update successfully', () => {
    const withError = reduceReviewPublishState(
      openPanel(createInitialReviewPublishState(), [createPublishDraft()]),
      {
        type: 'SET_ERROR_MESSAGE',
        errorMessage: 'Save failed',
      },
    );

    const recovered = reduceReviewPublishState(withError, {
      type: 'UPDATE_DRAFTS',
      drafts: [createPublishDraft({ body: 'Edited body' })],
    });

    expect(recovered.publishStatus).toBe('awaiting_approval');
    expect(recovered.errorMessage).toBeNull();
  });

  it('drops selections for drafts that become published on UPDATE_DRAFTS', () => {
    const initial = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);

    const updated = reduceReviewPublishState(initial, {
      type: 'UPDATE_DRAFTS',
      drafts: [createPublishDraft({ state: 'published' })],
    });

    expect(updated.selectedDraftIds).toEqual([]);
  });

  it('replaces the selected draft IDs on SET_SELECTED_IDS', () => {
    const initial = openPanel(createInitialReviewPublishState(), [
      createPublishDraft({ publishDraftId: 'p-1' }),
      createPublishDraft({ publishDraftId: 'p-2', localThreadId: 'thread-2' }),
    ]);

    const deselected = reduceReviewPublishState(initial, {
      type: 'SET_SELECTED_IDS',
      ids: ['p-2'],
    });

    expect(deselected.selectedDraftIds).toEqual(['p-2']);
  });

  it('transitions to publishing state on BEGIN_PUBLISH', () => {
    const initial = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);
    const begun = reduceReviewPublishState(initial, { type: 'BEGIN_PUBLISH' });

    expect(begun.publishStatus).toBe('publishing');
    expect(begun.errorMessage).toBeNull();
  });

  it('transitions to completed state and closes panel on PUBLISH_SUCCESS', () => {
    const initial = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);
    const begun = reduceReviewPublishState(initial, { type: 'BEGIN_PUBLISH' });
    const updatedDrafts = [createPublishDraft({ state: 'published' })];

    const success = reduceReviewPublishState(begun, {
      type: 'PUBLISH_SUCCESS',
      result: createPublishResult(),
      updatedDrafts,
      remoteThreads: [],
    });

    expect(success.publishStatus).toBe('completed');
    expect(success.isPanelOpen).toBe(false);
    expect(success.drafts[0]?.state).toBe('published');
    expect(success.selectedDraftIds).toEqual([]);
    expect(success.errorMessage).toBeNull();
    expect(success.lastResult?.publishedCount).toBe(1);
  });

  it('transitions to failed state and keeps panel open on PUBLISH_PARTIAL', () => {
    const draft1 = createPublishDraft({ publishDraftId: 'p-1', localThreadId: 'thread-1' });
    const draft2 = createPublishDraft({ publishDraftId: 'p-2', localThreadId: 'thread-2' });
    const initial = openPanel(createInitialReviewPublishState(), [draft1, draft2]);
    const begun = reduceReviewPublishState(initial, { type: 'BEGIN_PUBLISH' });

    const partialResult = createPublishResult({
      attemptedCount: 2,
      publishedCount: 1,
      failedCount: 1,
      items: [
        { publishDraftId: 'p-1', localThreadId: 'thread-1', status: 'published' },
        {
          publishDraftId: 'p-2',
          localThreadId: 'thread-2',
          status: 'failed',
          errorMessage: 'server error',
        },
      ],
    });

    const partial = reduceReviewPublishState(begun, {
      type: 'PUBLISH_PARTIAL',
      result: partialResult,
      updatedDrafts: [
        { ...draft1, state: 'published' },
        { ...draft2, state: 'failed', lastError: 'server error' },
      ],
    });

    expect(partial.publishStatus).toBe('failed');
    expect(partial.isPanelOpen).toBe(true);
    expect(partial.selectedDraftIds).toEqual(['p-2']);
    expect(partial.errorMessage).toBe('1 件の投稿に失敗しました。');
    expect(partial.lastResult?.failedCount).toBe(1);
  });

  it('transitions to failed state with error message on PUBLISH_FAIL', () => {
    const initial = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);
    const failed = reduceReviewPublishState(initial, {
      type: 'PUBLISH_FAIL',
      errorMessage: 'Network error',
    });

    expect(failed.publishStatus).toBe('failed');
    expect(failed.errorMessage).toBe('Network error');
    expect(failed.isPanelOpen).toBe(true);
  });

  it('surfaces open-panel failures without opening the panel', () => {
    const failed = reduceReviewPublishState(createInitialReviewPublishState(), {
      type: 'PUBLISH_FAIL',
      errorMessage: 'prepare failed',
    });

    expect(failed.publishStatus).toBe('failed');
    expect(failed.errorMessage).toBe('prepare failed');
    expect(failed.isPanelOpen).toBe(false);
  });

  it('keeps awaiting approval when inline draft saves fail', () => {
    const initial = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);
    const failed = reduceReviewPublishState(initial, {
      type: 'SET_ERROR_MESSAGE',
      errorMessage: 'Save failed',
    });

    expect(failed.publishStatus).toBe('awaiting_approval');
    expect(failed.errorMessage).toBe('Save failed');
    expect(failed.isPanelOpen).toBe(true);
  });

  it('resets to initial state on RESET', () => {
    const withPanel = openPanel(createInitialReviewPublishState(), [createPublishDraft()]);
    const reset = reduceReviewPublishState(withPanel, { type: 'RESET' });

    expect(reset).toEqual(createInitialReviewPublishState());
  });
});
