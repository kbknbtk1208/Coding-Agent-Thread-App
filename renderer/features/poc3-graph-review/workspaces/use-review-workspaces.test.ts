import { describe, expect, it } from 'vitest';
import {
  isReviewWorkspaceSelectable,
  shouldHydrateWorkspaceListForGraphEvent,
  type ReviewWorkspaceListItem,
} from './use-review-workspaces';

function createWorkspace(
  overrides: Partial<ReviewWorkspaceListItem> = {},
): ReviewWorkspaceListItem {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    repositoryLabel: 'owner/repo',
    provider: 'github',
    reviewId: '123',
    title: 'Review workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    setupStatus: 'completed',
    analysisStatus: 'completed',
    worktreeExists: true,
    canOpenInEditor: true,
    ...overrides,
  };
}

describe('isReviewWorkspaceSelectable', () => {
  it('allows only completed workspaces with an existing worktree', () => {
    expect(isReviewWorkspaceSelectable(createWorkspace())).toBe(true);
    expect(isReviewWorkspaceSelectable(createWorkspace({ worktreeExists: false }))).toBe(false);
    expect(isReviewWorkspaceSelectable(createWorkspace({ analysisStatus: 'running' }))).toBe(false);
    expect(isReviewWorkspaceSelectable(createWorkspace({ analysisStatus: 'failed' }))).toBe(false);
  });
});

describe('shouldHydrateWorkspaceListForGraphEvent', () => {
  it('waits until analysis completion before hydrating the workspace list', () => {
    expect(
      shouldHydrateWorkspaceListForGraphEvent({
        type: 'analysis.snapshot',
        analysisRunId: 'analysis-1',
        revisionId: 'revision-1',
        scopeKey: 'initial:diff-plus-1-hop:v1',
        status: 'running',
        phase: 'program',
        message: 'TypeScript Program を構築しています。',
      }),
    ).toBe(false);

    expect(
      shouldHydrateWorkspaceListForGraphEvent({
        type: 'analysis.snapshot',
        analysisRunId: 'analysis-1',
        revisionId: 'revision-1',
        scopeKey: 'initial:diff-plus-1-hop:v1',
        status: 'completed',
        phase: 'persist',
        message: 'Graph analysis completed',
      }),
    ).toBe(true);

    expect(
      shouldHydrateWorkspaceListForGraphEvent({
        type: 'graph.ready',
        revisionId: 'revision-1',
        scopeKey: 'initial:diff-plus-1-hop:v1',
        graphSnapshotId: 'graph-1',
      }),
    ).toBe(true);
  });
});
