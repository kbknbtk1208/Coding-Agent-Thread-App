import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AppSession } from '../../../shared/domain/agent';
import type { ReviewRunRecord, ReviewSummaryDraft } from '../../../shared/domain/review-draft';
import { ReviewActionPanel, type ReviewActionPanelProps } from './review-action-panel';

vi.mock('../../components/session-event-panel', () => ({
  SessionEventPanel: ({
    pendingSessionId,
    session,
  }: {
    pendingSessionId?: string | null;
    session: AppSession | null;
  }) =>
    React.createElement(
      'div',
      null,
      `stream:${pendingSessionId ?? 'none'}:${session?.appSessionId ?? 'none'}`,
    ),
}));

vi.mock('./review-execution-bar', () => ({
  ReviewExecutionBar: ({ reviewAgent, disabled }: { reviewAgent: string; disabled: boolean }) =>
    React.createElement(
      'div',
      null,
      `execution:${reviewAgent}:${disabled ? 'disabled' : 'enabled'}`,
    ),
}));

vi.mock('./review-summary-panel', () => ({
  ReviewSummaryPanel: ({
    status,
    error,
    summary,
  }: {
    status: string;
    error: string | null;
    summary: ReviewSummaryDraft | null;
  }) =>
    React.createElement(
      'div',
      null,
      `summary:${status}:${error ?? 'no-error'}:${summary?.headline ?? 'no-summary'}`,
    ),
}));

function createSession(): AppSession {
  return {
    appSessionId: 'session-1',
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
  };
}

function createRun(): ReviewRunRecord {
  return {
    runId: 'run-1',
    snapshotId: 'snapshot-1',
    reviewAgent: 'codex',
    lensId: 'general',
    instructions: 'review',
    rootAppSessionId: 'session-1',
    status: 'completed',
    resultSource: 'codexOutputSchema',
    createdAt: '2026-04-04T00:00:00.000Z',
    completedAt: '2026-04-04T00:01:00.000Z',
  };
}

function createSummary(): ReviewSummaryDraft {
  return {
    headline: 'summary headline',
    overview: 'overview',
    positives: ['positive'],
    risks: ['risk'],
  };
}

function createProps(overrides: Partial<ReviewActionPanelProps> = {}): ReviewActionPanelProps {
  return {
    reviewStatus: 'idle',
    reviewAgent: 'codex',
    instructions: 'review instructions',
    disabled: false,
    running: false,
    executionError: null,
    onReviewAgentChange: () => undefined,
    onInstructionsChange: () => undefined,
    onSubmit: () => undefined,
    pendingSessionId: 'session-1',
    session: createSession(),
    latestRun: createRun(),
    summary: createSummary(),
    fallbackRichText: null,
    fallbackReason: null,
    threadCount: 1,
    overviewConversationCount: 0,
    ...overrides,
  };
}

describe('ReviewActionPanel', () => {
  it('renders the execution controls in idle state', () => {
    const html = renderToStaticMarkup(React.createElement(ReviewActionPanel, createProps()));

    expect(html).toContain('execution:codex:enabled');
    expect(html).not.toContain('stream:');
    expect(html).not.toContain('summary:');
  });

  it('renders the event stream while drafting a review', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReviewActionPanel,
        createProps({
          reviewStatus: 'drafting_review',
          running: true,
        }),
      ),
    );

    expect(html).toContain('stream:session-1:session-1');
    expect(html).not.toContain('execution:');
    expect(html).not.toContain('summary:');
  });

  it('renders summary only in result state and shows overview note when needed', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReviewActionPanel,
        createProps({
          reviewStatus: 'showing_local_threads',
          overviewConversationCount: 2,
        }),
      ),
    );

    expect(html).toContain('summary:showing_local_threads:no-error:summary headline');
    expect(html).toContain('Overview conversation は main content 側で表示しています。');
    expect(html).not.toContain('stream:');
  });

  it('omits the overview note when there are no overview conversations', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReviewActionPanel,
        createProps({
          reviewStatus: 'showing_local_threads',
          overviewConversationCount: 0,
        }),
      ),
    );

    expect(html).not.toContain('Overview conversation は main content 側で表示しています。');
  });

  it('forwards the failure message to the summary in failed state', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReviewActionPanel,
        createProps({
          reviewStatus: 'failed',
          executionError: 'review failed',
          summary: null,
          threadCount: 0,
        }),
      ),
    );

    expect(html).toContain('summary:failed:review failed:no-summary');
  });
});
