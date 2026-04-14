import { describe, expect, it } from 'vitest';
import { createLocalThread } from '../../shared/domain/review-draft';
import type { ReviewLocalThread, ReviewThreadDraft } from '../../shared/domain/review-draft';
import type { ReviewPublishDraft } from '../../shared/domain/review-publish';
import { ReviewPublishDraftAssembler } from './review-publish-draft-assembler';

function createDraftThread(overrides: Partial<ReviewThreadDraft> = {}): ReviewThreadDraft {
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
    title: 'Test finding',
    draftBody: 'Test body',
    resolvedLocation: { kind: 'overview' },
    anchor: null,
    ...overrides,
  };
}

function createThread(overrides: Partial<ReviewThreadDraft> = {}): ReviewLocalThread {
  return createLocalThread(createDraftThread(overrides));
}

function createExistingPublishDraft(
  overrides: Partial<ReviewPublishDraft> = {},
): ReviewPublishDraft {
  return {
    publishDraftId: 'publish-existing',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    localThreadId: 'thread-1',
    sourceKind: 'ai-local-thread',
    title: 'Test finding',
    severity: 'medium',
    body: 'Edited body',
    originalBody: 'Test body',
    location: { kind: 'overview' },
    anchor: null,
    state: 'edited',
    lastError: null,
    publishedRemote: null,
    updatedAt: '2026-04-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('ReviewPublishDraftAssembler', () => {
  const assembler = new ReviewPublishDraftAssembler();
  const now = () => '2026-04-06T12:00:00.000Z';

  it('creates fresh publish drafts from local threads with no existing drafts', () => {
    const threads = [createThread(), createThread({ localThreadId: 'thread-2', runId: 'run-1' })];

    const result = assembler.seed('snapshot-1', threads, [], now);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      snapshotId: 'snapshot-1',
      runId: 'run-1',
      localThreadId: 'thread-1',
      sourceKind: 'ai-local-thread',
      title: 'Test finding',
      severity: 'medium',
      body: 'Test body',
      originalBody: 'Test body',
      state: 'ready',
      lastError: null,
      publishedRemote: null,
    });
    expect(result[0]?.publishDraftId).toMatch(/^publish-draft-/);
    expect(result[0]?.updatedAt).toBe('2026-04-06T12:00:00.000Z');
  });

  it('preserves existing publish drafts including edits rather than recreating them', () => {
    const threads = [createThread()];
    const existing = [createExistingPublishDraft()];

    const result = assembler.seed('snapshot-1', threads, existing, now);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      publishDraftId: 'publish-existing',
      body: 'Edited body',
      state: 'edited',
    });
  });

  it('preserves threads whose existing publish draft is already published', () => {
    const threads = [createThread()];
    const existing = [createExistingPublishDraft({ state: 'published' })];

    const result = assembler.seed('snapshot-1', threads, existing, now);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      publishDraftId: 'publish-existing',
      state: 'published',
    });
  });

  it('drops stored drafts when the corresponding local thread is no longer present', () => {
    const threads = [createThread({ localThreadId: 'thread-2', runId: 'run-2' })];
    const existing = [createExistingPublishDraft()];

    const result = assembler.seed('snapshot-1', threads, existing, now);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      localThreadId: 'thread-2',
      runId: 'run-2',
      body: 'Test body',
      state: 'ready',
    });
    expect(result[0]?.publishDraftId).not.toBe('publish-existing');
  });

  it('includes threads with failed existing drafts so they can be retried', () => {
    const threads = [createThread()];
    const existing = [createExistingPublishDraft({ state: 'failed', lastError: 'timeout' })];

    const result = assembler.seed('snapshot-1', threads, existing, now);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      publishDraftId: 'publish-existing',
      state: 'failed',
      lastError: 'timeout',
    });
  });

  it('returns a deep clone so mutations do not affect the result', () => {
    const threads = [createThread()];
    const existing = [createExistingPublishDraft()];

    const result = assembler.seed('snapshot-1', threads, existing, now);
    existing[0]!.body = 'mutated outside';

    expect(result[0]?.body).toBe('Edited body');
  });

  it('uses provided location from the thread draft', () => {
    const threads = [
      createThread({
        resolvedLocation: {
          kind: 'diff',
          fileId: 'file-1',
          filePath: 'src/main.ts',
          startLine: 5,
          endLine: 5,
          side: 'new',
        },
        anchor: {
          kind: 'line',
          fileId: 'file-1',
          filePath: 'src/main.ts',
          startLine: 5,
          endLine: 5,
          side: 'new',
        },
      }),
    ];

    const result = assembler.seed('snapshot-1', threads, [], now);

    expect(result[0]?.location).toEqual({
      kind: 'diff',
      fileId: 'file-1',
      filePath: 'src/main.ts',
      startLine: 5,
      endLine: 5,
      side: 'new',
    });
    expect(result[0]?.anchor).toMatchObject({
      kind: 'line',
      fileId: 'file-1',
    });
  });
});
