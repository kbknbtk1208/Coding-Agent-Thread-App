import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionSnapshot } from '../../../shared/contracts/agent-ipc';
import type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewRun,
} from '../../../shared/poc3-domain/agent-review';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { Poc3AgentReviewCoordinator } from './coordinator';

function createSession(): AgentSessionSnapshot {
  return {
    agent: 'codex',
    appSessionId: 'session-1',
    capabilities: ['structuredOutput'],
    createdAt: '2026-01-01T00:00:00.000Z',
    cwd: 'C:\\repo',
    pendingPermissions: [],
    status: 'completed',
    streamBuffer: { content: '', messageId: null },
    turns: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    finalResult: {
      kind: 'structured',
      schemaName: 'review-draft',
      source: 'codexOutputSchema',
      data: {
        type: 'review-draft',
        summary: {
          headline: 'Review',
          overview: 'Overview',
          positives: [],
          risks: [],
        },
        findings: [
          {
            findingId: 'finding-1',
            title: 'Title',
            body: 'Body',
            severity: 'high',
            category: 'correctness',
            confidence: 'high',
            location: { kind: 'overview' },
          },
        ],
      },
    },
  };
}

const workspace: ReviewWorkspace = {
  reviewWorkspaceId: 'workspace-1',
  repositoryProfileId: 'profile-1',
  provider: 'github',
  reviewUrl: 'https://github.com/acme/project/pull/1',
  reviewId: '1',
  title: 'Review title',
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  sourceBranchName: 'feature',
  worktreePath: 'C:\\repo',
  setupStatus: 'completed',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const graph: CodeGraphSnapshot = {
  graphSnapshotId: 'graph-1',
  revisionId: 'revision-1',
  scopeKey: 'initial',
  status: 'ready',
  nodes: [],
  edges: [],
  limits: {
    nodeLimit: 100,
    edgeLimit: 200,
    omittedNodeCount: 0,
    omittedEdgeCount: 0,
    reason: 'none',
  },
  diagnostics: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const record: WorkspaceGraphRecord = {
  workspace,
  activeRevision: {
    revisionId: 'revision-1',
    reviewWorkspaceId: workspace.reviewWorkspaceId,
    provider: 'github',
    reviewId: '1',
    baseSha: workspace.baseSha,
    headSha: workspace.headSha,
    startSha: null,
    sourceBranchName: workspace.sourceBranchName,
    diffVersion: null,
    isActive: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  analysis: null,
  graph,
  layout: null,
};

const sourceSnapshot: ReviewSourceSnapshot = {
  sourceSnapshotId: 'source-1',
  revisionId: 'revision-1',
  provider: 'github',
  reviewId: '1',
  title: 'Review title',
  description: '',
  baseSha: workspace.baseSha,
  headSha: workspace.headSha,
  startSha: null,
  diffVersion: null,
  changedFiles: [],
  remoteThreads: [],
  remoteThreadsSummary: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Poc3AgentReviewCoordinator', () => {
  it('starts a structured review session and stores the run', async () => {
    const session = createSession();
    const savedRuns: Poc3AgentReviewRun[] = [];
    const startSession = vi.fn().mockResolvedValue(session);
    const coordinator = new Poc3AgentReviewCoordinator({
      agentGateway: {
        startSession,
        awaitSettled: vi.fn(),
      },
      store: {
        saveRun: (run: Poc3AgentReviewRun) => {
          savedRuns.push(run);
          return run;
        },
      } as never,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const result = await coordinator.begin({
      reviewWorkspaceId: workspace.reviewWorkspaceId,
      scopeKey: 'initial',
      reviewAgent: 'codex',
      instructions: 'Focus on correctness.',
      codexModel: 'gpt-5.4',
      codexReasoningEffort: 'medium',
      cwd: workspace.worktreePath,
      record,
    });

    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        cwd: workspace.worktreePath,
        responseMode: 'structured',
        structuredSchemaName: 'review-draft',
        codexModel: 'gpt-5.4',
        codexReasoningEffort: 'medium',
      }),
    );
    expect(result.run).toMatchObject({
      reviewWorkspaceId: workspace.reviewWorkspaceId,
      revisionId: 'revision-1',
      status: 'starting',
      rootAppSessionId: 'session-1',
      codexModel: 'gpt-5.4',
      codexReasoningEffort: 'medium',
    });
    expect(savedRuns).toEqual([result.run]);
  });

  it('normalizes and stores structured agent results', async () => {
    const run: Poc3AgentReviewRun = {
      runId: 'run-1',
      reviewWorkspaceId: workspace.reviewWorkspaceId,
      revisionId: 'revision-1',
      scopeKey: 'initial',
      reviewAgent: 'codex',
      lensId: 'general',
      instructions: 'Focus on correctness.',
      rootAppSessionId: 'session-1',
      status: 'starting',
      resultSource: 'richText',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    };
    const envelopes: Poc3AgentReviewEnvelope[] = [];
    const coordinator = new Poc3AgentReviewCoordinator({
      agentGateway: {
        startSession: vi.fn(),
        awaitSettled: vi.fn().mockResolvedValue(createSession()),
      },
      store: {
        saveRun: vi.fn(),
        saveEnvelope: (envelope: Poc3AgentReviewEnvelope) => {
          envelopes.push(envelope);
          return envelope;
        },
      } as never,
      now: () => '2026-01-01T00:00:01.000Z',
    });

    const envelope = await coordinator.awaitResult({
      run,
      record,
      sourceSnapshot,
    });

    expect(envelope.kind).toBe('structured');
    expect(envelope.run).toMatchObject({
      runId: run.runId,
      status: 'completed',
      resultSource: 'codexOutputSchema',
      completedAt: '2026-01-01T00:00:01.000Z',
    });
    expect(envelopes).toEqual([envelope]);
  });
});
