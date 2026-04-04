import { describe, expect, it } from 'vitest';
import type { ReviewDraftEnvelope } from '../../shared/domain/review-draft';
import { ReviewDraftStore } from './review-draft-store';

function createEnvelope(runId: string): ReviewDraftEnvelope {
  return {
    kind: 'fallback-richText',
    run: {
      runId,
      snapshotId: 'snapshot-1',
      reviewAgent: 'codex',
      lensId: 'general',
      instructions: 'review it',
      rootAppSessionId: `session-${runId}`,
      status: 'fallback_rich_text',
      resultSource: 'richText',
      createdAt: '2026-04-03T00:00:00.000Z',
      completedAt: '2026-04-03T00:01:00.000Z',
    },
    content: `content-${runId}`,
    reason: 'structuredParseFailed',
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
});
