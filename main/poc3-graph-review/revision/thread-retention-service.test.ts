import { describe, expect, it } from 'vitest';
import type { CodeGraphNode, CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewChangedFile } from '../../../shared/poc3-domain/source-snapshot';
import type { Poc3ThreadTracking } from '../../../shared/poc3-domain/thread-retention';
import { snapshotNodeId, stableSymbolId } from '../analysis/graph-id';
import { ThreadRetentionService } from './thread-retention-service';

const timestamp = '2026-04-30T00:00:00.000Z';

function node(
  input: Partial<CodeGraphNode> & Pick<CodeGraphNode, 'nodeId' | 'stableSymbolId'>,
): CodeGraphNode {
  return {
    parentNodeId: null,
    kind: 'function',
    label: input.nodeId,
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
    changedLineNumbers: [],
    badges: {
      changedLines: 0,
      remoteThreadCount: 0,
      findingCount: 0,
    },
    ...input,
  };
}

function graph(revisionId: string, nodes: CodeGraphNode[]): CodeGraphSnapshot {
  return {
    graphSnapshotId: `graph-${revisionId}`,
    revisionId,
    scopeKey: INITIAL_GRAPH_SCOPE_KEY,
    status: 'ready',
    nodes,
    edges: [],
    limits: {
      nodeLimit: 100,
      edgeLimit: 100,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function revision(revisionId: string, status: RevisionContext['status']): RevisionContext {
  return {
    revisionId,
    reviewWorkspaceId: 'workspace-1',
    provider: 'github',
    reviewId: '1',
    baseSha: 'base',
    headSha: revisionId,
    startSha: null,
    sourceBranchName: 'feature',
    diffVersion: null,
    isActive: status === 'active',
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function thread(input: Partial<Poc3AgentReviewThread>): Poc3AgentReviewThread {
  return {
    localThreadId: input.localThreadId ?? 'thread-1',
    runId: 'run-1',
    reviewWorkspaceId: 'workspace-1',
    revisionId: 'old-revision',
    findingId: 'finding-1',
    nodeId: 'old-node',
    severity: 'medium',
    category: 'correctness',
    confidence: 'medium',
    title: 'Finding',
    draftBody: 'Body',
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 12,
      side: 'new',
    },
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  };
}

function createService(input: {
  currentGraph: CodeGraphSnapshot;
  sourceGraph: CodeGraphSnapshot | null;
  threads: Poc3AgentReviewThread[];
  sourceRevision?: RevisionContext;
  changedFiles?: ReviewChangedFile[];
}) {
  const saved: Poc3ThreadTracking[][] = [];
  const graphStore = {
    getWorkspaceGraphRecord() {
      return {
        workspace: null,
        activeRevision: revision(input.currentGraph.revisionId, 'active'),
        analysis: null,
        graph: input.currentGraph,
        layout: null,
      };
    },
    getGraphSnapshot(revisionId: string) {
      return revisionId === 'old-revision' ? input.sourceGraph : null;
    },
    getSourceSnapshotByRevision() {
      return {
        sourceSnapshotId: 'source-new-revision',
        revisionId: input.currentGraph.revisionId,
        provider: 'github',
        reviewId: '1',
        title: 'PR',
        description: null,
        baseSha: 'base',
        headSha: 'head',
        startSha: null,
        diffVersion: null,
        changedFiles: input.changedFiles ?? [],
        remoteThreadsSummary: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    },
    getRevision(revisionId: string) {
      if (revisionId === input.currentGraph.revisionId) {
        return revision(revisionId, 'active');
      }
      return input.sourceRevision ?? revision(revisionId, 'stale');
    },
  };
  const agentReviewStore = {
    listAllThreadsForWorkspace() {
      return input.threads;
    },
    saveThreadTracking(records: Poc3ThreadTracking[]) {
      saved.push(records);
    },
  };
  const service = new ThreadRetentionService(graphStore as never, agentReviewStore as never);
  return { service, saved };
}

describe('ThreadRetentionService', () => {
  it('tracks a prior thread when the generated nodeId is still current', () => {
    const stableId = stableSymbolId({
      filePath: 'src/example.ts',
      symbolName: 'handleSubmit',
      kind: 'function',
      startLine: 10,
    });
    const nodeId = snapshotNodeId(stableId);
    const { service, saved } = createService({
      currentGraph: graph('new-revision', [
        node({ nodeId, stableSymbolId: stableId, label: 'handleSubmit' }),
      ]),
      sourceGraph: graph('old-revision', [
        node({ nodeId, stableSymbolId: stableId, label: 'handleSubmit' }),
      ]),
      threads: [thread({ nodeId })],
    });

    const result = service.evaluate('workspace-1', 'new-revision');

    expect(result[0]).toMatchObject({
      localThreadId: 'thread-1',
      status: 'tracked',
      reason: null,
      trackedNodeId: nodeId,
    });
    expect(saved[0]).toHaveLength(1);
  });

  it('tracks a prior thread when the same symbol moves to different lines', () => {
    const oldStableId = stableSymbolId({
      filePath: 'src/example.ts',
      symbolName: 'handleSubmit',
      kind: 'function',
      startLine: 10,
    });
    const newStableId = stableSymbolId({
      filePath: 'src/example.ts',
      symbolName: 'handleSubmit',
      kind: 'function',
      startLine: 28,
    });
    const oldNodeId = snapshotNodeId(oldStableId);
    const newNodeId = snapshotNodeId(newStableId);
    const { service } = createService({
      currentGraph: graph('new-revision', [
        node({
          nodeId: newNodeId,
          stableSymbolId: newStableId,
          label: 'handleSubmit',
          declarationRange: {
            filePath: 'src/example.ts',
            startLine: 28,
            startColumn: 1,
            endLine: 38,
            endColumn: 1,
          },
        }),
      ]),
      sourceGraph: graph('old-revision', [
        node({
          nodeId: oldNodeId,
          stableSymbolId: oldStableId,
          label: 'handleSubmit',
        }),
      ]),
      threads: [thread({ nodeId: oldNodeId })],
    });

    const result = service.evaluate('workspace-1', 'new-revision');

    expect(result[0]).toMatchObject({
      status: 'tracked',
      reason: null,
      trackedNodeId: newNodeId,
    });
  });

  it('tracks a prior thread when its line still belongs to a node in the latest graph', () => {
    const { service } = createService({
      currentGraph: graph('new-revision', [
        node({
          nodeId: 'range-node',
          stableSymbolId: 'symbol:renamed',
          declarationRange: {
            filePath: 'src/example.ts',
            startLine: 8,
            startColumn: 1,
            endLine: 16,
            endColumn: 1,
          },
        }),
      ]),
      sourceGraph: graph('old-revision', [
        node({ nodeId: 'old-node', stableSymbolId: 'symbol:old' }),
      ]),
      threads: [thread({})],
    });

    const result = service.evaluate('workspace-1', 'new-revision');

    expect(result[0]).toMatchObject({
      status: 'tracked',
      reason: null,
      trackedNodeId: 'range-node',
    });
  });

  it('marks a prior thread as fileDeleted when the file is gone from the latest graph', () => {
    const { service } = createService({
      currentGraph: graph('new-revision', [
        node({
          nodeId: 'other-node',
          stableSymbolId: 'symbol:other',
          filePath: 'src/other.ts',
          declarationRange: {
            filePath: 'src/other.ts',
            startLine: 1,
            startColumn: 1,
            endLine: 3,
            endColumn: 1,
          },
        }),
      ]),
      sourceGraph: graph('old-revision', [
        node({ nodeId: 'old-node', stableSymbolId: 'symbol:old' }),
      ]),
      changedFiles: [
        {
          path: 'src/example.ts',
          oldPath: null,
          status: 'removed',
          additions: 0,
          deletions: 10,
          patch: null,
          hunks: [],
        },
      ],
      threads: [thread({})],
    });

    const result = service.evaluate('workspace-1', 'new-revision');

    expect(result[0]).toMatchObject({
      status: 'outdated',
      reason: 'fileDeleted',
      trackedNodeId: null,
    });
  });

  it('marks a prior thread as rangeChanged when the file remains but no node covers the line', () => {
    const { service } = createService({
      currentGraph: graph('new-revision', [
        node({
          nodeId: 'current-node',
          stableSymbolId: 'symbol:current',
          label: 'differentSymbol',
          declarationRange: {
            filePath: 'src/example.ts',
            startLine: 30,
            startColumn: 1,
            endLine: 40,
            endColumn: 1,
          },
        }),
      ]),
      sourceGraph: graph('old-revision', [
        node({
          nodeId: 'old-node',
          stableSymbolId: 'symbol:old',
          label: 'oldSymbol',
        }),
      ]),
      changedFiles: [
        {
          path: 'src/example.ts',
          oldPath: null,
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: null,
          hunks: [],
        },
      ],
      threads: [thread({})],
    });

    const result = service.evaluate('workspace-1', 'new-revision');

    expect(result[0]).toMatchObject({
      status: 'outdated',
      reason: 'rangeChanged',
      trackedNodeId: null,
    });
  });

  it('marks a prior orphaned diff thread as unavailable when source code cannot be inspected', () => {
    const { service } = createService({
      currentGraph: graph('new-revision', [
        node({ nodeId: 'current-node', stableSymbolId: 'symbol:current' }),
      ]),
      sourceGraph: null,
      sourceRevision: revision('old-revision', 'orphaned'),
      threads: [thread({})],
    });

    const result = service.evaluate('workspace-1', 'new-revision');

    expect(result[0]).toMatchObject({
      status: 'unavailable',
      reason: 'orphanedRevision',
      trackedNodeId: null,
    });
  });
});
