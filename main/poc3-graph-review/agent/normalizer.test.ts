import { describe, expect, it } from 'vitest';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { ReviewDraftStructuredResult } from '../../../shared/domain/review-draft';
import { Poc3AgentReviewNormalizer } from './normalizer';

const graph: CodeGraphSnapshot = {
  graphSnapshotId: 'graph-1',
  revisionId: 'revision-1',
  scopeKey: 'initial',
  status: 'ready',
  nodes: [
    {
      nodeId: 'node-1',
      stableSymbolId: 'src/example.ts#handle',
      parentNodeId: null,
      kind: 'function',
      label: 'handle',
      filePath: 'src/example.ts',
      declarationRange: {
        filePath: 'src/example.ts',
        startLine: 10,
        startColumn: 1,
        endLine: 20,
        endColumn: 1,
      },
      diffStatus: 'changed',
      isDiffNode: true,
      changedLineNumbers: [12],
      badges: {
        changedLines: 1,
        remoteThreadCount: 0,
        findingCount: 0,
      },
    },
  ],
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

const sourceSnapshot: ReviewSourceSnapshot = {
  sourceSnapshotId: 'source-1',
  revisionId: 'revision-1',
  provider: 'github',
  reviewId: '123',
  title: 'Review',
  description: '',
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  startSha: null,
  diffVersion: null,
  changedFiles: [
    {
      path: 'src/example.ts',
      oldPath: null,
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,10 +10,10 @@',
      hunks: [
        {
          filePath: 'src/example.ts',
          oldStart: 10,
          oldLines: 10,
          newStart: 10,
          newLines: 10,
          header: '@@ -10,10 +10,10 @@',
          changedNewLines: [12],
          changedOldLines: [],
        },
      ],
    },
  ],
  remoteThreads: [],
  remoteThreadsSummary: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function createStructuredResult(): ReviewDraftStructuredResult {
  return {
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
        title: 'Validate input',
        body: 'Input validation is missing.',
        severity: 'high',
        category: 'correctness',
        confidence: 'high',
        suggestion: 'Validate null input.',
        location: {
          kind: 'diff',
          filePath: 'src/example.ts',
          startLine: 12,
          endLine: 12,
          side: 'new',
        },
      },
    ],
  };
}

describe('Poc3AgentReviewNormalizer', () => {
  it('normalizes structured findings into graph-linked agent threads', () => {
    const threads = new Poc3AgentReviewNormalizer().normalize({
      runId: 'run-1',
      reviewWorkspaceId: 'workspace-1',
      revisionId: 'revision-1',
      graph,
      sourceSnapshot,
      result: createStructuredResult(),
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      runId: 'run-1',
      reviewWorkspaceId: 'workspace-1',
      revisionId: 'revision-1',
      findingId: 'finding-1',
      nodeId: 'node-1',
      title: 'Validate input',
      location: {
        kind: 'diff',
        filePath: 'src/example.ts',
        startLine: 12,
        endLine: 12,
        side: 'new',
      },
      status: 'open',
    });
    expect(threads[0].draftBody).toContain('Suggestion:');
  });

  it('downgrades unknown diff locations to overview with debug metadata', () => {
    const result = createStructuredResult();
    result.findings[0] = {
      ...result.findings[0],
      location: {
        kind: 'diff',
        filePath: 'src/missing.ts',
        startLine: 12,
        endLine: 12,
        side: 'new',
      },
    };

    const threads = new Poc3AgentReviewNormalizer().normalize({
      runId: 'run-1',
      reviewWorkspaceId: 'workspace-1',
      revisionId: 'revision-1',
      graph,
      sourceSnapshot,
      result,
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    expect(threads[0]).toMatchObject({
      nodeId: null,
      location: { kind: 'overview' },
      debugDowngrade: {
        reason: 'fileNotFound',
        requestedFilePath: 'src/missing.ts',
      },
    });
  });
});
