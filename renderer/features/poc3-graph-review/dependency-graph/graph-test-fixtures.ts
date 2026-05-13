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

export function createLayeredGraphSnapshot(): GraphRenderSnapshot {
  const snapshot = createGraphSnapshot();
  return {
    ...snapshot,
    layers: {
      layerProfileId: 'layer-profile-1',
      profileVersion: 1,
      appliedAt: '2026-05-12T00:00:00.000Z',
      status: 'ready',
      enabled: true,
      lanes: [
        {
          laneId: 'frontend',
          layerPath: 'frontend',
          displayName: 'frontend',
          order: 1,
          parentLayerPath: null,
          bounds: { x: -40, y: -40, width: 220, height: 160 },
          nodeIds: ['node-1'],
          unclassified: false,
        },
        {
          laneId: 'unclassified',
          layerPath: 'unclassified',
          displayName: 'unclassified',
          order: 999,
          parentLayerPath: null,
          bounds: { x: 200, y: -40, width: 220, height: 160 },
          nodeIds: ['node-2'],
          unclassified: true,
        },
      ],
      groups: [],
      unclassifiedSummary: {
        nodeCount: 1,
        fileCount: 1,
        directories: [],
      },
      ignoredSummary: {
        nodeCount: 0,
        fileCount: 0,
      },
      violationEdgeIds: ['edge-1'],
      diagnostics: [],
    },
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      layer:
        node.nodeId === 'node-1'
          ? {
              nodeId: node.nodeId,
              filePath: node.filePath,
              normalizedFilePath: node.filePath,
              status: 'classified',
              layerPath: 'frontend',
              layerRuleId: 'rule-1',
              matchedLayerRuleIds: ['rule-1'],
              conflictingLayerRuleIds: [],
              ignoredPatternId: null,
            }
          : {
              nodeId: node.nodeId,
              filePath: node.filePath,
              normalizedFilePath: node.filePath,
              status: 'unclassified',
              layerPath: null,
              layerRuleId: null,
              matchedLayerRuleIds: [],
              conflictingLayerRuleIds: [],
              ignoredPatternId: null,
            },
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      layer: {
        edgeId: edge.edgeId,
        sourceLayerPath: 'frontend',
        targetLayerPath: 'backend',
        direction: 'reverse',
        isArchitectureViolation: true,
      },
    })),
  };
}
