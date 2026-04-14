import { describe, expect, it } from 'vitest';
import type { ReviewSnapshotThread } from '../../shared/domain/review';
import { type ReviewDraftEnvelope, type ReviewThreadDraft } from '../../shared/domain/review-draft';
import type { ReviewPublishDraft, ReviewPublishResult } from '../../shared/domain/review-publish';
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

function createPublishDraft(overrides: Partial<ReviewPublishDraft> = {}): ReviewPublishDraft {
  return {
    publishDraftId: 'publish-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    localThreadId: 'thread-1',
    sourceKind: 'ai-local-thread',
    title: 'Publish title',
    severity: 'medium',
    body: 'Publish body',
    originalBody: 'Publish body',
    location: {
      kind: 'diff',
      fileId: 'file-1',
      filePath: 'src/example.ts',
      startLine: 3,
      endLine: 3,
      side: 'new',
    },
    anchor: {
      kind: 'line',
      fileId: 'file-1',
      filePath: 'src/example.ts',
      startLine: 3,
      endLine: 3,
      side: 'new',
    },
    state: 'ready',
    lastError: null,
    publishedRemote: null,
    updatedAt: '2026-04-06T00:00:00.000Z',
    ...overrides,
  };
}

function createPublishedRemoteThread(
  overrides: Partial<ReviewSnapshotThread> = {},
): ReviewSnapshotThread {
  return {
    threadId: 'remote-thread-1',
    location: {
      kind: 'diff',
      fileId: 'file-1',
      filePath: 'src/example.ts',
      startLine: 3,
      endLine: 3,
      side: 'new',
    },
    comments: [
      {
        commentId: 'comment-1',
        author: 'reviewer',
        body: 'Published body',
        createdAt: '2026-04-06T00:00:10.000Z',
        position: {
          filePath: 'src/example.ts',
          startLine: 3,
          endLine: 3,
          side: 'new',
        },
      },
    ],
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: 'discussion-1',
      remoteCommentIds: ['comment-1'],
      anchorRefs: {},
    },
    ...overrides,
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

  it('stores publish drafts independently and marks publish results for retry or completion', () => {
    const store = new ReviewDraftStore();
    const initialDraft = createPublishDraft();

    store.savePublishDrafts('snapshot-1', [initialDraft]);

    const fetchedDrafts = store.getPublishDrafts('snapshot-1');
    expect(fetchedDrafts).toEqual([initialDraft]);

    fetchedDrafts[0]!.body = 'mutated outside store';
    expect(store.getPublishDrafts('snapshot-1')[0]?.body).toBe('Publish body');

    const result: ReviewPublishResult = {
      snapshotId: 'snapshot-1',
      attemptedCount: 1,
      publishedCount: 1,
      failedCount: 0,
      items: [
        {
          publishDraftId: initialDraft.publishDraftId,
          localThreadId: initialDraft.localThreadId,
          status: 'published',
          remoteThread: createPublishedRemoteThread(),
        },
      ],
    };

    store.markPublishResult('snapshot-1', result);

    expect(store.getPublishDrafts('snapshot-1')).toEqual([
      expect.objectContaining({
        publishDraftId: 'publish-1',
        state: 'published',
        lastError: null,
        publishedRemote: expect.objectContaining({
          provider: 'github',
          remoteDiscussionId: 'discussion-1',
          remoteCommentIds: ['comment-1'],
        }),
      }),
    ]);
  });

  it('infers gitlab provider when published remote thread ids come from gitlab discussions', () => {
    const store = new ReviewDraftStore();
    const initialDraft = createPublishDraft();

    store.savePublishDrafts('snapshot-1', [initialDraft]);

    store.markPublishResult('snapshot-1', {
      snapshotId: 'snapshot-1',
      attemptedCount: 1,
      publishedCount: 1,
      failedCount: 0,
      items: [
        {
          publishDraftId: initialDraft.publishDraftId,
          localThreadId: initialDraft.localThreadId,
          status: 'published',
          remoteThread: createPublishedRemoteThread({
            threadId: 'gitlab-discussion-42',
            providerContext: {
              remoteDiscussionId: 'discussion-42',
              remoteCommentIds: ['comment-42'],
              anchorRefs: {},
            },
          }),
        },
      ],
    });

    expect(store.getPublishDrafts('snapshot-1')).toEqual([
      expect.objectContaining({
        publishDraftId: 'publish-1',
        state: 'published',
        publishedRemote: expect.objectContaining({
          provider: 'gitlab',
          remoteDiscussionId: 'discussion-42',
          remoteCommentIds: ['comment-42'],
        }),
      }),
    ]);
  });
});
