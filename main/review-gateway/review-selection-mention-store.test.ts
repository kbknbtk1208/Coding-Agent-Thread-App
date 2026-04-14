import { describe, expect, it } from 'vitest';
import type { ReviewMentionThread } from '../../shared/domain/review-mention';
import { ReviewSelectionMentionStore } from './review-selection-mention-store';

function createThread(mentionThreadId = 'mention-1'): ReviewMentionThread {
  return {
    mentionThreadId,
    snapshotId: 'snapshot-1',
    reviewAgent: 'codex',
    selection: {
      snapshotId: 'snapshot-1',
      fileId: 'file-1',
      filePath: 'src/example.ts',
      side: 'new',
      startLine: 1,
      endLine: 2,
      anchor: {
        fileId: 'file-1',
        filePath: 'src/example.ts',
        startLine: 1,
        endLine: 2,
        side: 'new',
        kind: 'range',
      },
      selectedExcerpt: 'L1: a\nL2: b',
      surroundingExcerpt: null,
      nearbyRemoteThreadIds: [],
      nearbyDraftThreadIds: [],
    },
    messages: [],
    binding: null,
    replyStatus: 'idle',
    lastError: null,
    activeSessionId: null,
    activeSession: null,
    promotedDraftThreadId: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z',
  };
}

describe('ReviewSelectionMentionStore', () => {
  it('saves and clones mention threads per snapshot', () => {
    const store = new ReviewSelectionMentionStore();
    const thread = createThread();
    store.saveThread('snapshot-1', thread);

    const stored = store.getThread('snapshot-1', 'mention-1');
    expect(stored?.mentionThreadId).toBe('mention-1');

    if (stored) {
      stored.messages.push({
        localMessageId: 'mutated',
        mentionThreadId: 'mention-1',
        role: 'user',
        source: 'user-reply',
        body: 'mutated',
        createdAt: '2026-04-14T00:00:00.000Z',
      });
    }

    expect(store.getThread('snapshot-1', 'mention-1')?.messages).toEqual([]);
  });

  it('appends messages and marks promoted state', () => {
    const store = new ReviewSelectionMentionStore();
    store.saveThread('snapshot-1', createThread());

    store.appendMessage('snapshot-1', 'mention-1', {
      localMessageId: 'message-1',
      mentionThreadId: 'mention-1',
      role: 'assistant',
      source: 'agent-reply',
      body: 'answer',
      createdAt: '2026-04-14T00:01:00.000Z',
    });
    store.markPromoted('snapshot-1', 'mention-1', 'draft-1');

    const stored = store.getThread('snapshot-1', 'mention-1');
    expect(stored?.messages.map((message) => message.body)).toEqual(['answer']);
    expect(stored?.replyStatus).toBe('promoted');
    expect(stored?.promotedDraftThreadId).toBe('draft-1');
  });
});
