import { describe, expect, it } from 'vitest';
import type { GraphRenderNode, GraphRenderSnapshot } from '../../shared/poc3-domain/graph';
import { buildGraphViewSnapshot } from './graph-review-gateway';

function createNode(overrides: Partial<GraphRenderNode> & { nodeId: string }): GraphRenderNode {
  return {
    nodeId: overrides.nodeId,
    stableSymbolId: overrides.stableSymbolId ?? overrides.nodeId,
    parentNodeId: null,
    kind: overrides.kind ?? 'function',
    label: overrides.label ?? overrides.nodeId,
    filePath: overrides.filePath ?? 'src/example.ts',
    declarationRange: null,
    diffStatus: overrides.diffStatus ?? 'related',
    isDiffNode: overrides.isDiffNode ?? false,
    changedLineNumbers: overrides.changedLineNumbers ?? [],
    badges: overrides.badges ?? { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
    position: overrides.position ?? { x: 0, y: 0 },
    size: overrides.size ?? { width: 100, height: 50 },
    extent: null,
    layer: overrides.layer ?? null,
  };
}

function createGraph(): GraphRenderSnapshot {
  return {
    revisionId: 'revision-1',
    graphSnapshotId: 'graph-1',
    scopeKey: 'initial:diff-plus-1-hop:v1',
    status: 'ready',
    nodes: [
      createNode({
        nodeId: 'node-visible',
        isDiffNode: true,
        position: { x: 0, y: 0 },
        layer: {
          nodeId: 'node-visible',
          filePath: 'src/visible.ts',
          normalizedFilePath: 'src/visible.ts',
          status: 'unclassified',
          layerPath: null,
          layerRuleId: null,
          matchedLayerRuleIds: [],
          conflictingLayerRuleIds: [],
          ignoredPatternId: null,
        },
      }),
      createNode({
        nodeId: 'node-hidden',
        position: { x: 900, y: 500 },
        layer: {
          nodeId: 'node-hidden',
          filePath: 'src/hidden.ts',
          normalizedFilePath: 'src/hidden.ts',
          status: 'unclassified',
          layerPath: null,
          layerRuleId: null,
          matchedLayerRuleIds: [],
          conflictingLayerRuleIds: [],
          ignoredPatternId: null,
        },
      }),
      createNode({
        nodeId: 'node-finding',
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 1 },
        position: { x: 320, y: 0 },
        layer: {
          nodeId: 'node-finding',
          filePath: 'src/finding.ts',
          normalizedFilePath: 'src/finding.ts',
          status: 'ignored',
          layerPath: null,
          layerRuleId: null,
          matchedLayerRuleIds: [],
          conflictingLayerRuleIds: [],
          ignoredPatternId: 'ignore-1',
        },
      }),
    ],
    edges: [
      {
        edgeId: 'edge-visible',
        sourceNodeId: 'node-visible',
        targetNodeId: 'node-finding',
        kind: 'calls',
        confidence: 'high',
        label: 'calls',
      },
      {
        edgeId: 'edge-hidden',
        sourceNodeId: 'node-visible',
        targetNodeId: 'node-hidden',
        kind: 'calls',
        confidence: 'high',
        label: 'calls',
      },
    ],
    viewport: { x: 10, y: 20, zoom: 0.5 },
    limits: {
      nodeLimit: 250,
      edgeLimit: 700,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    layers: {
      layerProfileId: 'profile-1',
      profileVersion: 1,
      appliedAt: '2026-01-01T00:00:00.000Z',
      status: 'ready',
      enabled: true,
      lanes: [
        {
          laneId: 'lane-visible',
          layerPath: 'visible',
          displayName: 'visible',
          order: 1,
          parentLayerPath: null,
          bounds: { x: -999, y: -999, width: 9999, height: 9999 },
          nodeIds: ['node-visible', 'node-hidden'],
          unclassified: false,
        },
        {
          laneId: 'lane-hidden',
          layerPath: 'hidden',
          displayName: 'hidden',
          order: 2,
          parentLayerPath: null,
          bounds: { x: 800, y: 420, width: 500, height: 400 },
          nodeIds: ['node-hidden'],
          unclassified: false,
        },
      ],
      groups: [
        {
          groupId: 'group-mixed',
          layerPath: 'mixed',
          displayName: 'mixed',
          bounds: { x: -999, y: -999, width: 9999, height: 9999 },
          childLaneIds: ['lane-visible', 'lane-hidden'],
        },
        {
          groupId: 'group-hidden',
          layerPath: 'hidden',
          displayName: 'hidden',
          bounds: { x: 800, y: 420, width: 500, height: 400 },
          childLaneIds: ['lane-hidden'],
        },
      ],
      unclassifiedSummary: { nodeCount: 2, fileCount: 2, directories: [] },
      ignoredSummary: { nodeCount: 1, fileCount: 1 },
      violationEdgeIds: ['edge-visible', 'edge-hidden'],
      diagnostics: [],
    },
  };
}

describe('buildGraphViewSnapshot', () => {
  it('partial view 用に layers を可視 node / edge だけへ絞る', () => {
    const view = buildGraphViewSnapshot(createGraph(), {
      mode: 'initial',
      revealedNodeIds: [],
    });

    expect(view.nodes.map((node) => node.nodeId)).toEqual(['node-visible', 'node-finding']);
    expect(view.edges.map((edge) => edge.edgeId)).toEqual(['edge-visible']);
    expect(view.viewport).toBeNull();
    expect(view.layers?.lanes.map((lane) => lane.laneId)).toEqual(['lane-visible']);
    expect(view.layers?.lanes[0]?.nodeIds).toEqual(['node-visible']);
    expect(view.layers?.lanes[0]?.bounds).toEqual({ x: -64, y: -72, width: 360, height: 240 });
    expect(view.layers?.groups).toEqual([
      expect.objectContaining({
        groupId: 'group-mixed',
        childLaneIds: ['lane-visible'],
        bounds: { x: -64, y: -72, width: 360, height: 240 },
      }),
    ]);
    expect(view.layers?.unclassifiedSummary).toMatchObject({
      nodeCount: 1,
      fileCount: 1,
      directories: [
        expect.objectContaining({
          directoryPath: 'src',
          nodeCount: 1,
          fileCount: 1,
        }),
      ],
    });
    expect(view.layers?.ignoredSummary).toEqual({ nodeCount: 1, fileCount: 1 });
    expect(view.layers?.violationEdgeIds).toEqual(['edge-visible']);
  });

  it('layers がない graph はそのまま扱う', () => {
    const graph = createGraph();
    const withoutLayers = { ...graph, layers: undefined };
    const view = buildGraphViewSnapshot(withoutLayers, {
      mode: 'initial',
      revealedNodeIds: [],
    });

    expect(view.layers).toBeUndefined();
  });
});
