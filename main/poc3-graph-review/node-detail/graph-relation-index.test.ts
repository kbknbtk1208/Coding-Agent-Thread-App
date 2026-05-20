import { describe, expect, it } from 'vitest';
import type { GraphRenderSnapshot } from '../../../shared/poc3-domain/graph';
import { buildGraphRelationIndex } from './graph-relation-index';

describe('buildGraphRelationIndex', () => {
  it('indexes incoming and outgoing edges by node id', () => {
    const snapshot = createSnapshot();
    const index = buildGraphRelationIndex(snapshot);

    expect(index.nodeById.get('a')?.label).toBe('A');
    expect(index.incomingByNodeId.get('b')?.map((edge) => edge.edgeId)).toEqual(['a-b']);
    expect(index.outgoingByNodeId.get('b')?.map((edge) => edge.edgeId)).toEqual(['b-c']);
  });
});

function createSnapshot(): GraphRenderSnapshot {
  const node = (nodeId: string, label: string): GraphRenderSnapshot['nodes'][number] => ({
    nodeId,
    stableSymbolId: nodeId,
    parentNodeId: null,
    kind: 'function',
    label,
    filePath: 'src/a.ts',
    declarationRange: null,
    diffStatus: 'changed',
    isDiffNode: true,
    changedLineNumbers: [],
    badges: {
      changedLines: 0,
      remoteThreadCount: 0,
      findingCount: 0,
    },
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    extent: null,
  });
  return {
    revisionId: 'r1',
    graphSnapshotId: 'g1',
    scopeKey: 'scope',
    status: 'ready',
    nodes: [node('a', 'A'), node('b', 'B'), node('c', 'C')],
    edges: [
      {
        edgeId: 'a-b',
        sourceNodeId: 'a',
        targetNodeId: 'b',
        kind: 'calls',
        confidence: 'high',
        label: null,
      },
      {
        edgeId: 'b-c',
        sourceNodeId: 'b',
        targetNodeId: 'c',
        kind: 'imports',
        confidence: 'high',
        label: 'imports',
      },
    ],
    viewport: null,
    limits: {
      nodeLimit: 10,
      edgeLimit: 10,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
  };
}
