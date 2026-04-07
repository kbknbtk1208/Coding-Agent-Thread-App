import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AppSession } from '../../../shared/domain/agent';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import { DraftThreadCard } from './draft-thread-card';

vi.mock('./draft-thread-composer', () => ({
  DraftThreadComposer: ({ thread }: { thread: ReviewLocalThread }) =>
    React.createElement('div', null, `composer:${thread.localThreadId}`),
}));

function createSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    appSessionId: 'thread-session-1',
    agent: 'codex',
    cwd: 'C:\\repo',
    status: 'running',
    capabilities: [],
    createdAt: '2026-04-04T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z',
    turns: [],
    streamBuffer: {
      messageId: null,
      content: '',
    },
    pendingPermissions: [],
    ...overrides,
  };
}

function createThread(
  localThreadId: string,
  overrides: Partial<ReviewLocalThread> = {},
): ReviewLocalThread {
  return {
    localThreadId,
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    draft: {
      localThreadId,
      snapshotId: 'snapshot-1',
      runId: 'run-1',
      findingId: 'finding-1',
      source: 'ai-review',
      state: 'draft',
      category: 'correctness',
      severity: 'medium',
      confidence: 'high',
      title: 'Test Finding',
      draftBody: 'Test finding body',
      resolvedLocation: {
        kind: 'diff',
        fileId: 'file-1',
        filePath: 'test.ts',
        startLine: 10,
        endLine: 10,
        side: 'new',
      },
      anchor: {
        fileId: 'file-1',
        filePath: 'test.ts',
        startLine: 10,
        endLine: 10,
        side: 'new',
        kind: 'line',
      },
      debugDowngrade: undefined,
    },
    messages: [
      {
        localMessageId: `${localThreadId}:initial`,
        localThreadId,
        role: 'assistant',
        source: 'initial-finding',
        body: 'Initial finding body',
        createdAt: '2026-04-04T00:00:00.000Z',
      },
    ],
    binding: null,
    replyStatus: 'idle',
    lastError: null,
    activeReplySessionId: null,
    activeReplySession: null,
    ...overrides,
  };
}

describe('DraftThreadCard', () => {
  const noop = () => undefined;

  it('renders collapsed card with finding preview for non-selected threads', () => {
    const html = renderToStaticMarkup(
      React.createElement(DraftThreadCard, {
        thread: createThread('thread-1'),
        isSelected: false,
        replyBody: '',
        onSelectThread: noop,
        onReplyBodyChange: noop,
        onSubmitReply: noop,
        onRespondToPermission: noop,
      }),
    );

    expect(html).toContain('Test Finding');
    expect(html).toContain('Test finding body');
    expect(html).toContain('test.ts:L10');
    expect(html).not.toContain('Thread history');
    expect(html).not.toContain('composer:thread-1');
  });

  it('renders expanded history, stream, and composer only for the selected thread', () => {
    const thread = createThread('thread-1', {
      replyStatus: 'replying',
      activeReplySessionId: 'thread-session-1',
      activeReplySession: createSession({
        turns: [
          {
            turnId: 'turn-1',
            prompt: 'reply prompt',
            status: 'running',
            result: undefined,
            response: '',
            responseMode: 'richText',
            messageId: 'message-1',
            intermediateSegments: [],
            startedAt: '2026-04-04T00:00:01.000Z',
          },
        ],
      }),
    });

    const html = renderToStaticMarkup(
      React.createElement(DraftThreadCard, {
        thread,
        isSelected: true,
        replyBody: 'my reply',
        onSelectThread: noop,
        onReplyBodyChange: noop,
        onSubmitReply: noop,
        onRespondToPermission: noop,
      }),
    );

    expect(html).toContain('Thread history');
    expect(html).toContain('session: thread-session-1');
    expect(html).toContain('composer:thread-1');
  });

  it('does not duplicate a transient stream after the agent reply is already saved', () => {
    const responseBody = 'Saved assistant reply';
    const thread = createThread('thread-1', {
      replyStatus: 'replying',
      messages: [
        {
          localMessageId: 'thread-1:initial',
          localThreadId: 'thread-1',
          role: 'assistant',
          source: 'initial-finding',
          body: 'Initial finding body',
          createdAt: '2026-04-04T00:00:00.000Z',
        },
        {
          localMessageId: 'thread-1:user',
          localThreadId: 'thread-1',
          role: 'user',
          source: 'user-reply',
          body: 'Question',
          createdAt: '2026-04-04T00:00:01.000Z',
        },
        {
          localMessageId: 'thread-1:agent',
          localThreadId: 'thread-1',
          role: 'assistant',
          source: 'agent-reply',
          body: responseBody,
          createdAt: '2026-04-04T00:00:02.000Z',
        },
      ],
      activeReplySessionId: 'thread-session-1',
      activeReplySession: createSession({
        turns: [
          {
            turnId: 'turn-1',
            prompt: 'reply prompt',
            status: 'running',
            result: undefined,
            response: responseBody,
            responseMode: 'richText',
            messageId: 'message-1',
            intermediateSegments: [],
            startedAt: '2026-04-04T00:00:01.000Z',
          },
        ],
      }),
    });

    const html = renderToStaticMarkup(
      React.createElement(DraftThreadCard, {
        thread,
        isSelected: true,
        replyBody: '',
        onSelectThread: noop,
        onReplyBodyChange: noop,
        onSubmitReply: noop,
        onRespondToPermission: noop,
      }),
    );

    expect(html.match(/Saved assistant reply/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain('session: thread-session-1');
  });

  it('renders debug downgrade details for selected overview findings', () => {
    const html = renderToStaticMarkup(
      React.createElement(DraftThreadCard, {
        thread: createThread('thread-1', {
          draft: {
            localThreadId: 'thread-1',
            snapshotId: 'snapshot-1',
            runId: 'run-1',
            findingId: 'finding-1',
            source: 'ai-review',
            state: 'draft',
            category: 'correctness',
            severity: 'high',
            confidence: 'high',
            title: 'Overview Finding',
            draftBody: 'Overview body',
            resolvedLocation: {
              kind: 'overview',
            },
            anchor: null,
            debugDowngrade: {
              reason: 'fileNotFound',
              requestedFilePath: 'missing.ts',
              requestedSide: 'new',
              requestedStartLine: 1,
              requestedEndLine: 5,
            },
          },
        }),
        isSelected: true,
        replyBody: '',
        onSelectThread: noop,
        onReplyBodyChange: noop,
        onSubmitReply: noop,
        onRespondToPermission: noop,
      }),
    );

    expect(html).toContain('Debug: diff to overview fallback');
    expect(html).toContain('snapshot 内で対象 filePath を解決できませんでした。');
    expect(html).toContain('requested diff: missing.ts [new] L1-L5');
  });
});
