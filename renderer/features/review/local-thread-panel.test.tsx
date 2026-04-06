import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import { LocalThreadPanel } from './local-thread-panel';

function createBaseThread(): ReviewLocalThread {
  return {
    localThreadId: 'thread-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    draft: {
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
    },
    messages: [
      {
        localMessageId: 'thread-1:initial',
        localThreadId: 'thread-1',
        role: 'assistant',
        source: 'initial-finding',
        body: 'Thread body',
        createdAt: '2026-04-03T00:00:00.000Z',
      },
      {
        localMessageId: 'thread-1:user-1',
        localThreadId: 'thread-1',
        role: 'user',
        source: 'user-reply',
        body: 'Can you clarify the impact?',
        createdAt: '2026-04-03T00:01:00.000Z',
      },
    ],
    binding: null,
    replyStatus: 'idle',
    lastError: null,
    activeReplySessionId: null,
    activeReplySession: null,
  };
}

describe('LocalThreadPanel', () => {
  it('renders the debug fallback explanation for downgraded overview findings', () => {
    const html = renderToStaticMarkup(
      <LocalThreadPanel
        threads={[
          {
            ...createBaseThread(),
            draft: {
              ...createBaseThread().draft,
              debugDowngrade: {
                reason: 'excerptNotFound',
                requestedFilePath: 'src/example.ts',
                requestedSide: 'new',
                requestedStartLine: 10,
                requestedEndLine: 12,
              },
            },
          },
        ]}
        selectedFileId={null}
        selectedLocalThreadId="thread-1"
        onSelectFile={() => undefined}
        onSelectThread={() => undefined}
        onReply={() => undefined}
        onRespondToPermission={() => undefined}
        fallbackActive={false}
      />,
    );

    expect(html).toContain('Debug: diff to overview fallback');
    expect(html).toContain('requested excerpt が対象 side の本文に一致しませんでした。');
    expect(html).toContain('requested diff: src/example.ts [new] L10-L12');
  });

  it('renders thread history and reply composer for the selected local thread', () => {
    const html = renderToStaticMarkup(
      <LocalThreadPanel
        threads={[createBaseThread()]}
        selectedFileId={null}
        selectedLocalThreadId="thread-1"
        onSelectFile={() => undefined}
        onSelectThread={() => undefined}
        onReply={() => undefined}
        onRespondToPermission={() => undefined}
        fallbackActive={false}
      />,
    );

    expect(html).toContain('Thread history');
    expect(html).toContain('Assistant');
    expect(html).toContain('You');
    expect(html).toContain('Can you clarify the impact?');
    expect(html).toContain('Reply in panel');
    expect(html).toContain('Send');
  });

  it('shows thread-level error details when the latest reply failed', () => {
    const html = renderToStaticMarkup(
      <LocalThreadPanel
        threads={[
          {
            ...createBaseThread(),
            replyStatus: 'failed',
            lastError: 'thread reply failed',
          },
        ]}
        selectedFileId={null}
        selectedLocalThreadId="thread-1"
        onSelectFile={() => undefined}
        onSelectThread={() => undefined}
        onReply={() => undefined}
        onRespondToPermission={() => undefined}
        fallbackActive={false}
      />,
    );

    expect(html).toContain('thread reply failed');
    expect(html).toContain('failed');
  });
});
