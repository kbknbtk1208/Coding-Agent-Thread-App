import { describe, expect, it } from 'vitest';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';
import {
  buildAgentReviewPrompt,
  buildAgentReviewStartRequest,
  toAgentReviewRunStatus,
} from './agent-review-state';

const workspace: ReviewWorkspaceListItem = {
  reviewWorkspaceId: 'workspace-1',
  repositoryLabel: 'owner/repo',
  provider: 'github',
  reviewId: '123',
  title: 'Add graph review',
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
  setupStatus: 'completed',
  analysisStatus: 'completed',
  worktreeExists: true,
};

const graph: GraphRenderSnapshot = {
  revisionId: 'revision-1',
  graphSnapshotId: 'graph-1',
  scopeKey: 'initial:diff-plus-1-hop:v1',
  status: 'ready',
  nodes: [
    {
      nodeId: 'node-1',
      stableSymbolId: 'symbol-1',
      parentNodeId: null,
      kind: 'function',
      label: 'runReview',
      filePath: 'renderer/features/poc3-graph-review/agent-review/use-agent-review.ts',
      declarationRange: null,
      diffStatus: 'changed',
      isDiffNode: true,
      changedLineNumbers: [10, 11],
      badges: {
        changedLines: 2,
        remoteThreadCount: 0,
        findingCount: 1,
      },
      position: { x: 0, y: 0 },
      size: { width: 220, height: 70 },
      extent: null,
    },
  ],
  edges: [],
  viewport: null,
  limits: {
    nodeLimit: 80,
    edgeLimit: 140,
    omittedNodeCount: 0,
    omittedEdgeCount: 0,
    reason: 'none',
  },
  diagnostics: [],
};

describe('agent-review-state', () => {
  it('maps agent statuses to agent review statuses', () => {
    expect(toAgentReviewRunStatus('idle')).toBe('running');
    expect(toAgentReviewRunStatus('starting')).toBe('starting');
    expect(toAgentReviewRunStatus('waiting_permission')).toBe('waiting_permission');
    expect(toAgentReviewRunStatus('completed')).toBe('completed');
    expect(toAgentReviewRunStatus('failed')).toBe('failed');
  });

  it('builds a prompt with workspace and graph context', () => {
    const prompt = buildAgentReviewPrompt({ workspace, graph });

    expect(prompt).toContain('PoC-3 Agent Review');
    expect(prompt).toContain('owner/repo github#123');
    expect(prompt).toContain('Graph snapshot: graph-1');
    expect(prompt).toContain('runReview');
    expect(prompt).toContain('Existing finding nodes: runReview:1');
  });

  it('includes Codex model and effort only for Codex review starts', () => {
    expect(
      buildAgentReviewStartRequest({
        target: { workspace, graph },
        selectedAgent: 'codex',
        instructions: 'Focus.',
        codexModel: 'gpt-5.4',
        codexReasoningEffort: 'medium',
      }),
    ).toMatchObject({
      agent: 'codex',
      codexModel: 'gpt-5.4',
      codexReasoningEffort: 'medium',
    });

    expect(
      buildAgentReviewStartRequest({
        target: { workspace, graph },
        selectedAgent: 'copilot',
        instructions: 'Focus.',
        codexModel: 'gpt-5.4',
        codexReasoningEffort: 'medium',
      }),
    ).toMatchObject({
      agent: 'copilot',
      codexModel: undefined,
      codexReasoningEffort: undefined,
    });
  });
});
