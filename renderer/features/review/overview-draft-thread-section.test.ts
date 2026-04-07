import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import { OverviewDraftThreadSection } from './overview-draft-thread-section';

vi.mock('./draft-thread-card', () => ({
  DraftThreadCard: ({
    thread,
    isSelected,
    replyBody,
  }: {
    thread: ReviewLocalThread;
    isSelected: boolean;
    replyBody: string;
  }) =>
    React.createElement(
      'div',
      null,
      `${thread.localThreadId}:${isSelected ? 'selected' : 'collapsed'}:${replyBody}`,
    ),
}));

function createOverviewThread(localThreadId: string, title: string): ReviewLocalThread {
  return {
    localThreadId,
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    draft: {
      localThreadId,
      snapshotId: 'snapshot-1',
      runId: 'run-1',
      findingId: `finding-${localThreadId}`,
      source: 'ai-review',
      state: 'draft',
      severity: 'medium',
      category: 'maintainability',
      confidence: 'high',
      title,
      draftBody: `${title} body`,
      resolvedLocation: {
        kind: 'overview',
      },
      anchor: null,
    },
    messages: [],
    binding: null,
    replyStatus: 'idle',
    lastError: null,
    activeReplySessionId: null,
    activeReplySession: null,
  };
}

describe('OverviewDraftThreadSection', () => {
  it('renders overview threads in title order and expands only the selected thread', () => {
    const html = renderToStaticMarkup(
      React.createElement(OverviewDraftThreadSection, {
        threads: [
          createOverviewThread('thread-b', 'Beta finding'),
          createOverviewThread('thread-a', 'Alpha finding'),
        ],
        selectedLocalThreadId: 'thread-b',
        replyBodies: {
          'thread-a': 'draft a',
          'thread-b': 'draft b',
        },
        onSelectThread: () => undefined,
        onReplyBodyChange: () => undefined,
        onSubmitReply: () => undefined,
        onRespondToPermission: () => undefined,
      }),
    );

    expect(html).toContain('Overview Findings');
    expect(html).toContain('2 drafts');
    expect(html.indexOf('thread-a:collapsed:draft a')).toBeLessThan(
      html.indexOf('thread-b:selected:draft b'),
    );
  });

  it('returns no markup when there are no overview threads', () => {
    const html = renderToStaticMarkup(
      React.createElement(OverviewDraftThreadSection, {
        threads: [],
        selectedLocalThreadId: null,
        replyBodies: {},
        onSelectThread: () => undefined,
        onReplyBodyChange: () => undefined,
        onSubmitReply: () => undefined,
        onRespondToPermission: () => undefined,
      }),
    );

    expect(html).toBe('');
  });
});
