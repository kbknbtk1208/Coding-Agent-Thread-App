import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceCreationJobView } from './use-workspace-creation-jobs';
import { WorkspaceCreationCard } from './workspace-creation-card';

function createJob(overrides: Partial<WorkspaceCreationJobView> = {}): WorkspaceCreationJobView {
  return {
    jobId: 'job-1',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    repositoryProfileId: 'profile-1',
    repositoryLabel: 'acme/project',
    worktreePath: 'C:\\worktrees\\project-pr-123',
    status: 'running',
    phase: 'analysisProgram',
    latestLogLine: 'TypeScript Program を構築しています。',
    logLines: ['TypeScript Program を構築しています。'],
    errorMessage: null,
    reviewWorkspaceId: 'workspace-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    expanded: false,
    dismissed: false,
    retrying: false,
    trackedAnalysisRunId: null,
    trackedRevisionId: null,
    ...overrides,
  };
}

describe('WorkspaceCreationCard', () => {
  it('keeps shimmer text visible while analysis is running', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceCreationCard, {
        job: createJob(),
        onToggleExpand: vi.fn(),
        onDismiss: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(html).toContain('text-shimmer');
    expect(html).toContain('TypeScript Program を構築しています。');
  });

  it('renders retry action for failed jobs with a persisted workspace id', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceCreationCard, {
        job: createJob({
          status: 'failed',
          phase: 'analysisProgram',
          errorMessage: 'TypeScript Program の構築に失敗しました。',
        }),
        onToggleExpand: vi.fn(),
        onDismiss: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(html).toContain('Retry graph analysis');
    expect(html).toContain('Dismiss card');
  });
});
