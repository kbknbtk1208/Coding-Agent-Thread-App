import { describe, expect, it } from 'vitest';
import { type ReviewDraftEnvelope, type ReviewThreadDraft } from '../../shared/domain/review-draft';
import { ReviewDraftStore } from './review-draft-store';

function createRun(runId: string): ReviewDraftEnvelope['run'] {
  return {
    runId,
    snapshotId: 'snapshot-1',
    reviewAgent: 'codex',
    lensId: 'general',
    instructions: 'review it',
    rootAppSessionId: `session-${runId}`,
    status: 'completed',
    resultSource: 'codexOutputSchema',
    createdAt: '2026-04-03T00:00:00.000Z',
    completedAt: '2026-04-03T00:01:00.000Z',
  };
}

function createDraft(overrides: Partial<ReviewThreadDraft> = {}): ReviewThreadDraft {
  return {
    localThreadId: 'thread-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    findingId: 'finding-1',
    source: 'ai-review',
    state: 'draft',
    severity: 'medium',
    category: 'maintainability',
    confidence: 'high',
    title: 'Thread title',
    draftBody: 'Thread body',
    resolvedLocation: {
      kind: 'overview',
    },
    anchor: null,
    ...overrides,
  };
}

function createEnvelope(runId: string, localThreadId = 'thread-1'): ReviewDraftEnvelope {
  return {
    kind: 'structured',
    run: createRun(runId),
    summary: {
      headline: 'headline',
      overview: 'overview',
      positives: [],
      risks: [],
    },
    threads: [createDraft({ localThreadId, runId })],
  };
}

describe('ReviewDraftStore', () => {
  it('keeps completed envelopes addressable by runId after later runs overwrite latestEnvelope', () => {
    const store = new ReviewDraftStore();
    const first = createEnvelope('run-1');
    const second = createEnvelope('run-2');

    store.saveEnvelope('snapshot-1', first);
    store.saveEnvelope('snapshot-1', second);

    expect(store.getLatestEnvelope('snapshot-1')).toEqual(second);
    expect(store.getEnvelopeByRunId('run-1')).toEqual(first);
    expect(store.getEnvelopeByRunId('run-2')).toEqual(second);
  });

  it('updates local thread state without mutating the stored envelope run metadata', () => {
    const store = new ReviewDraftStore();
    store.saveEnvelope('snapshot-1', createEnvelope('run-1'));

    store.appendThreadMessage('snapshot-1', 'thread-1', {
      localMessageId: 'thread-1:user:1',
      localThreadId: 'thread-1',
      role: 'user',
      source: 'user-reply',
      body: 'Can you clarify this?',
      createdAt: '2026-04-03T00:02:00.000Z',
    });
    store.setThreadBinding('snapshot-1', 'thread-1', {
      snapshotId: 'snapshot-1',
      localThreadId: 'thread-1',
      runId: 'run-1',
      rootAppSessionId: 'session-run-1',
      discussionAppSessionId: 'thread-session-1',
      strategy: 'codex-fork',
      createdAt: '2026-04-03T00:02:00.000Z',
      lastUsedAt: '2026-04-03T00:02:00.000Z',
    });
    store.setThreadReplyState('snapshot-1', 'thread-1', {
      replyStatus: 'replying',
      lastError: null,
      activeReplySessionId: 'thread-session-1',
      activeReplySession: null,
    });

    const thread = store.getLocalThread('snapshot-1', 'thread-1');
    expect(thread?.messages.at(-1)?.body).toBe('Can you clarify this?');
    expect(thread?.binding?.discussionAppSessionId).toBe('thread-session-1');
    expect(thread?.replyStatus).toBe('replying');
    expect(store.getRuns('snapshot-1')[0]?.runId).toBe('run-1');
  });

  it('replaces local threads when a newer structured envelope is saved for the same snapshot', () => {
    const store = new ReviewDraftStore();
    store.saveEnvelope('snapshot-1', createEnvelope('run-1', 'thread-1'));

    store.appendThreadMessage('snapshot-1', 'thread-1', {
      localMessageId: 'thread-1:user:1',
      localThreadId: 'thread-1',
      role: 'user',
      source: 'user-reply',
      body: 'Old run follow-up',
      createdAt: '2026-04-03T00:02:00.000Z',
    });

    store.saveEnvelope('snapshot-1', createEnvelope('run-2', 'thread-2'));

    expect(store.getLocalThread('snapshot-1', 'thread-1')).toBeNull();
    expect(store.getLocalThreads('snapshot-1')).toEqual([
      expect.objectContaining({
        localThreadId: 'thread-2',
        runId: 'run-2',
        messages: [
          expect.objectContaining({
            localThreadId: 'thread-2',
            source: 'initial-finding',
          }),
        ],
      }),
    ]);
  });
});
