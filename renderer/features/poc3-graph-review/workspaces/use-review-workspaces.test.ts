import { describe, expect, it } from 'vitest';
import { shouldHydrateWorkspaceListForGraphEvent } from './use-review-workspaces';

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
