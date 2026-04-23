import { describe, expect, it } from 'vitest';
import type { GraphAnalysisEvent } from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { WorkspaceCreationJobView } from './use-workspace-creation-jobs';
import {
  applyGraphEventToJob,
  fallbackMessageForPhase,
  matchesTrackedAnalysis,
  toWorkspacePhase,
} from './use-workspace-creation-jobs';

function createJob(overrides: Partial<WorkspaceCreationJobView> = {}): WorkspaceCreationJobView {
  return {
    jobId: 'job-1',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    repositoryProfileId: 'profile-1',
    repositoryLabel: 'acme/project',
    worktreePath: 'C:\\worktrees\\project-pr-123',
    status: 'failed',
    phase: 'analysisProgram',
    latestLogLine: 'previous',
    logLines: ['previous'],
    errorMessage: 'failed',
    reviewWorkspaceId: 'workspace-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    expanded: false,
    dismissed: false,
    retrying: true,
    trackedAnalysisRunId: 'analysis-1',
    trackedRevisionId: 'revision-1',
    ...overrides,
  };
}

describe('useWorkspaceCreationJobs helpers', () => {
  it('maps graph analysis phases into workspace creation phases', () => {
    expect(toWorkspacePhase('program')).toBe('analysisProgram');
    expect(toWorkspacePhase('extract')).toBe('analysisExtract');
    expect(toWorkspacePhase('buildGraph')).toBe('analysisBuildGraph');
    expect(toWorkspacePhase('layout')).toBe('analysisLayout');
    expect(toWorkspacePhase('persist')).toBe('analysisPersist');
    expect(fallbackMessageForPhase('diffScope')).toBe('Graph analysis queued');
  });

  it('updates a tracked retry job from graph analysis events', () => {
    const event: GraphAnalysisEvent = {
      type: 'analysis.snapshot',
      analysisRunId: 'analysis-1',
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      status: 'running',
      phase: 'layout',
      message: 'Graph layout を計算しています。',
    };

    expect(matchesTrackedAnalysis(createJob(), event)).toBe(true);

    const next = applyGraphEventToJob(createJob(), event);
    expect(next.status).toBe('running');
    expect(next.phase).toBe('analysisLayout');
    expect(next.latestLogLine).toBe('Graph layout を計算しています。');
  });

  it('marks the job completed when graph.ready arrives', () => {
    const next = applyGraphEventToJob(createJob(), {
      type: 'graph.ready',
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      graphSnapshotId: 'graph-1',
    });

    expect(next.status).toBe('completed');
    expect(next.phase).toBe('done');
    expect(next.trackedAnalysisRunId).toBeNull();
    expect(next.trackedRevisionId).toBeNull();
  });
});
