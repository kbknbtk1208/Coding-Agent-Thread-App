import type { AppSession } from '../../../shared/domain/agent';
import type { ReviewDraftEnvelope, ReviewRunRecord } from '../../../shared/domain/review-draft';
import { describe, expect, it } from 'vitest';
import { createInitialReviewDraftState, reduceReviewDraftState } from './review-draft-state';

function createCompletedRun(
  overrides: Partial<ReviewDraftEnvelope['run']> = {},
): ReviewDraftEnvelope['run'] {
  return {
    runId: 'run-1',
    snapshotId: 'snapshot-1',
    reviewAgent: 'codex',
    lensId: 'general',
    instructions: '全体をレビューして',
    rootAppSessionId: 'session-1',
    status: 'completed',
    resultSource: 'codexOutputSchema',
    createdAt: '2026-04-03T00:00:00.000Z',
    completedAt: '2026-04-03T00:01:00.000Z',
    ...overrides,
  };
}

function createDraftingRun(overrides: Partial<ReviewRunRecord> = {}): ReviewRunRecord {
  return {
    ...createCompletedRun({
      status: 'drafting_review',
      completedAt: undefined,
      resultSource: 'richText',
    }),
    ...overrides,
  };
}

function createStructuredEnvelope(): Extract<ReviewDraftEnvelope, { kind: 'structured' }> {
  return {
    kind: 'structured',
    run: createCompletedRun(),
    summary: {
      headline: 'headline',
      overview: 'overview',
      positives: ['good'],
      risks: ['risk'],
    },
    threads: [
      {
        localThreadId: 'thread-1',
        snapshotId: 'snapshot-1',
        runId: 'run-1',
        findingId: 'finding-1',
        source: 'ai-review',
        state: 'draft',
        severity: 'high',
        category: 'correctness',
        confidence: 'high',
        title: 'title',
        draftBody: 'body',
        suggestion: 'suggestion',
        resolvedLocation: { kind: 'overview' },
        anchor: null,
      },
    ],
  };
}

function createFallbackEnvelope(): Extract<ReviewDraftEnvelope, { kind: 'fallback-richText' }> {
  return {
    kind: 'fallback-richText',
    run: createCompletedRun({
      runId: 'run-2',
      reviewAgent: 'copilot',
      rootAppSessionId: 'session-2',
      status: 'fallback_rich_text',
      resultSource: 'richText',
      createdAt: '2026-04-03T00:02:00.000Z',
      completedAt: '2026-04-03T00:03:00.000Z',
    }),
    content: 'raw markdown',
    reason: 'structuredParseFailed',
  };
}

function createSessionSnapshot(overrides: Partial<AppSession> = {}): AppSession {
  return {
    appSessionId: 'session-1',
    agent: 'codex',
    cwd: 'C:/workspace',
    status: 'starting',
    capabilities: ['structuredOutput'],
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    turns: [
      {
        turnId: 'turn-1',
        messageId: 'message-1',
        prompt: 'review this diff',
        response: '',
        intermediateSegments: [],
        responseMode: 'structured',
        structuredSchemaName: 'review-draft',
        structuredOutputMode: 'normal',
        status: 'starting',
        startedAt: '2026-04-03T00:00:00.000Z',
      },
    ],
    streamBuffer: {
      content: '',
      messageId: 'message-1',
    },
    finalResult: undefined,
    lastError: undefined,
    pendingPermissions: [],
    ...overrides,
  };
}

describe('review draft state reducer', () => {
  it('starts in idle state', () => {
    expect(createInitialReviewDraftState()).toEqual({
      reviewStatus: 'idle',
      latestRun: null,
      summary: null,
      localDraftThreads: [],
      fallbackRichText: null,
      fallbackReason: null,
      errorMessage: null,
      activeRunSessionId: null,
      activeRunSession: null,
    });
  });

  it('clears previous results and active session when a review starts', () => {
    const started = reduceReviewDraftState(createInitialReviewDraftState(), { type: 'START' });

    expect(started).toEqual({
      reviewStatus: 'drafting_review',
      latestRun: null,
      summary: null,
      localDraftThreads: [],
      fallbackRichText: null,
      fallbackReason: null,
      errorMessage: null,
      activeRunSessionId: null,
      activeRunSession: null,
    });
  });

  it('stores the active run metadata and initial session snapshot when review begins', () => {
    const begun = reduceReviewDraftState(createInitialReviewDraftState(), {
      type: 'BEGIN',
      run: createDraftingRun(),
      session: createSessionSnapshot(),
    });

    expect(begun.reviewStatus).toBe('drafting_review');
    expect(begun.latestRun?.runId).toBe('run-1');
    expect(begun.activeRunSessionId).toBe('session-1');
    expect(begun.activeRunSession?.appSessionId).toBe('session-1');
    expect(begun.activeRunSession?.status).toBe('starting');
  });

  it('updates the active session when streaming agent events arrive before snapshot sync completes', () => {
    const begun = reduceReviewDraftState(createInitialReviewDraftState(), {
      type: 'BEGIN',
      run: createDraftingRun(),
      session: createSessionSnapshot(),
    });
    const updated = reduceReviewDraftState(begun, {
      type: 'APPLY_ACTIVE_SESSION_EVENT',
      event: {
        type: 'progress.updated',
        appSessionId: 'session-1',
        messageId: 'message-1',
        progressHint: {
          kind: 'tool',
          text: 'ツールを呼び出しています',
          updatedAt: '2026-04-03T00:00:05.000Z',
        },
      },
    });

    expect(updated.activeRunSession?.status).toBe('running');
    expect(updated.activeRunSession?.turns[0]?.intermediateSegments).toEqual([
      {
        kind: 'progress',
        progressKind: 'tool',
        segmentId: 'turn-1:segment:1',
        text: 'ツールを呼び出しています',
        updatedAt: '2026-04-03T00:00:05.000Z',
      },
    ]);
  });

  it('stores structured review results while keeping the streamed session log', () => {
    const begun = reduceReviewDraftState(createInitialReviewDraftState(), {
      type: 'BEGIN',
      run: createDraftingRun(),
      session: createSessionSnapshot(),
    });
    const synced = reduceReviewDraftState(begun, {
      type: 'SYNC_ACTIVE_SESSION',
      session: createSessionSnapshot(),
    });
    const structured = reduceReviewDraftState(synced, {
      type: 'RESOLVE_STRUCTURED',
      envelope: createStructuredEnvelope(),
    });

    expect(structured.reviewStatus).toBe('showing_local_threads');
    expect(structured.latestRun?.runId).toBe('run-1');
    expect(structured.summary?.headline).toBe('headline');
    expect(structured.localDraftThreads).toHaveLength(1);
    expect(structured.activeRunSession?.appSessionId).toBe('session-1');
    expect(structured.errorMessage).toBeNull();
  });

  it('stores fallback rich text without local draft threads', () => {
    const fallback = reduceReviewDraftState(createInitialReviewDraftState(), {
      type: 'RESOLVE_FALLBACK',
      envelope: createFallbackEnvelope(),
    });

    expect(fallback.reviewStatus).toBe('showing_local_threads');
    expect(fallback.latestRun?.runId).toBe('run-2');
    expect(fallback.summary).toBeNull();
    expect(fallback.localDraftThreads).toHaveLength(0);
    expect(fallback.fallbackRichText).toBe('raw markdown');
    expect(fallback.fallbackReason).toBe('structuredParseFailed');
    expect(fallback.errorMessage).toBeNull();
  });

  it('records failures without discarding the captured session log', () => {
    const begun = reduceReviewDraftState(createInitialReviewDraftState(), {
      type: 'BEGIN',
      run: createDraftingRun(),
      session: createSessionSnapshot(),
    });
    const synced = reduceReviewDraftState(begun, {
      type: 'SYNC_ACTIVE_SESSION',
      session: createSessionSnapshot(),
    });
    const failed = reduceReviewDraftState(synced, {
      type: 'FAIL',
      errorMessage: 'boom',
    });

    expect(failed).toEqual({
      reviewStatus: 'failed',
      latestRun: {
        ...createDraftingRun(),
        status: 'failed',
      },
      summary: null,
      localDraftThreads: [],
      fallbackRichText: null,
      fallbackReason: null,
      errorMessage: 'boom',
      activeRunSessionId: 'session-1',
      activeRunSession: createSessionSnapshot(),
    });
  });

  it('resets to the initial state', () => {
    const reset = reduceReviewDraftState(createInitialReviewDraftState(), { type: 'RESET' });

    expect(reset).toEqual(createInitialReviewDraftState());
  });
});
