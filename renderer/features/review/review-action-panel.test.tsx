import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AppSession } from '../../../shared/domain/agent';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import type {
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadDraft,
} from '../../../shared/domain/review-draft';
import { ReviewActionPanel, type ReviewActionPanelProps } from './review-action-panel';

vi.mock('../../components/session-event-panel', () => ({
  SessionEventPanel: ({
    pendingSessionId,
    session,
  }: {
    pendingSessionId?: string | null;
    session: AppSession | null;
  }) => (
    <div>
      stream:{pendingSessionId ?? 'none'}:{session?.appSessionId ?? 'none'}
    </div>
  ),
}));

vi.mock('./review-execution-bar', () => ({
  ReviewExecutionBar: ({ reviewAgent, disabled }: { reviewAgent: string; disabled: boolean }) => (
    <div>
      execution:{reviewAgent}:{disabled ? 'disabled' : 'enabled'}
    </div>
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
  }) => (
    <div>
      summary:{status}:{error ?? 'no-error'}:{summary?.headline ?? 'no-summary'}
    </div>
  ),
}));

vi.mock('./local-thread-panel', () => ({
  LocalThreadPanel: ({
    threads,
    selectedFileId,
    fallbackActive,
  }: {
    threads: ReviewThreadDraft[];
    selectedFileId: string | null;
    fallbackActive: boolean;
  }) => (
    <div>
      drafts:{threads.length}:{selectedFileId ?? 'none'}:{fallbackActive ? 'fallback' : 'normal'}
    </div>
  ),
}));

vi.mock('./overview-discussion-panel', () => ({
  OverviewDiscussionPanel: ({ threads }: { threads: ReviewSnapshotThread[] }) => (
    <div>overview:{threads.length}</div>
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

function createDraftThread(): ReviewThreadDraft {
  return {
    localThreadId: 'local-thread-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    findingId: 'finding-1',
    source: 'ai-review',
    state: 'draft',
    severity: 'high',
    category: 'correctness',
    confidence: 'high',
    title: 'Thread title',
    draftBody: 'Thread body',
    resolvedLocation: {
      kind: 'diff',
      fileId: 'file-1',
      filePath: 'src/file.ts',
      startLine: 10,
      endLine: 12,
      side: 'new',
    },
    anchor: {
      fileId: 'file-1',
      filePath: 'src/file.ts',
      startLine: 10,
      endLine: 12,
      side: 'new',
      kind: 'range',
    },
  };
}

function createOverviewThread(): ReviewSnapshotThread {
  return {
    threadId: 'thread-1',
    location: {
      kind: 'overview',
    },
    comments: [
      {
        commentId: 'comment-1',
        author: 'reviewer',
        body: 'overview body',
        createdAt: '2026-04-04T00:00:00.000Z',
        position: null,
      },
    ],
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteCommentIds: [],
      anchorRefs: {},
    },
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
    localDraftThreads: [createDraftThread()],
    overviewThreads: [createOverviewThread()],
    selectedFileId: 'file-1',
    fallbackActive: false,
    activeTab: 'drafts',
    onSelectFile: () => undefined,
    onTabChange: () => undefined,
    onReply: () => undefined,
    ...overrides,
  };
}

describe('ReviewActionPanel', () => {
  it('renders the execution controls in idle state', () => {
    const html = renderToStaticMarkup(<ReviewActionPanel {...createProps()} />);

    expect(html).toContain('execution:codex:enabled');
    expect(html).not.toContain('stream:');
    expect(html).not.toContain('summary:');
  });

  it('renders the event stream while drafting a review', () => {
    const html = renderToStaticMarkup(
      <ReviewActionPanel
        {...createProps({
          reviewStatus: 'drafting_review',
          running: true,
        })}
      />,
    );

    expect(html).toContain('stream:session-1:session-1');
    expect(html).not.toContain('execution:');
    expect(html).not.toContain('summary:');
  });

  it('renders summary and local drafts after a structured review completes', () => {
    const html = renderToStaticMarkup(
      <ReviewActionPanel
        {...createProps({
          reviewStatus: 'showing_local_threads',
          activeTab: 'drafts',
        })}
      />,
    );

    expect(html).toContain('summary:showing_local_threads:no-error:summary headline');
    expect(html).toContain('Drafts');
    expect(html).toContain('Overview');
    expect(html).toContain('drafts:1:file-1:normal');
    expect(html).not.toContain('stream:');
  });

  it('renders overview discussion when the overview tab is selected', () => {
    const html = renderToStaticMarkup(
      <ReviewActionPanel
        {...createProps({
          reviewStatus: 'showing_local_threads',
          activeTab: 'overview',
        })}
      />,
    );

    expect(html).toContain('overview:1');
    expect(html).not.toContain('drafts:1:file-1:normal');
  });

  it('forwards the failure message to the summary in failed state', () => {
    const html = renderToStaticMarkup(
      <ReviewActionPanel
        {...createProps({
          reviewStatus: 'failed',
          executionError: 'review failed',
          summary: null,
          localDraftThreads: [],
          threadCount: 0,
        })}
      />,
    );

    expect(html).toContain('summary:failed:review failed:no-summary');
  });
});
