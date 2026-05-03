import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';

export function createGraphSnapshot(): GraphRenderSnapshot {
  return {
    revisionId: 'revision-1',
    graphSnapshotId: 'snapshot-1',
    scopeKey: 'scope-1',
    status: 'ready',
    viewport: null,
    limits: {
      nodeLimit: 100,
      edgeLimit: 100,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    nodes: [
      {
        nodeId: 'node-1',
        stableSymbolId: 'symbol-1',
        parentNodeId: null,
        kind: 'function',
        label: 'source',
        filePath: 'src/source.ts',
        declarationRange: null,
        diffStatus: 'changed',
        isDiffNode: true,
        changedLineNumbers: [1],
        badges: { changedLines: 1, findingCount: 0, remoteThreadCount: 0 },
        position: { x: 0, y: 0 },
        size: { width: 180, height: 64 },
        extent: null,
      },
      {
        nodeId: 'node-2',
        stableSymbolId: 'symbol-2',
        parentNodeId: null,
        kind: 'function',
        label: 'target',
        filePath: 'src/target.ts',
        declarationRange: null,
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, findingCount: 1, remoteThreadCount: 1 },
        position: { x: 240, y: 0 },
        size: { width: 180, height: 64 },
        extent: null,
      },
    ],
    edges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        kind: 'calls',
        confidence: 'high',
        label: 'calls',
      },
    ],
  };
}
