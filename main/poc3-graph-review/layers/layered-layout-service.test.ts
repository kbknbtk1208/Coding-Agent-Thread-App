import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type {
  GraphNodeLayerClassification,
  RepositoryLayerProfile,
} from '../../../shared/poc3-domain/layer-profile';
import { LayeredLayoutService } from './layered-layout-service';

const { layoutMock } = vi.hoisted(() => ({
  layoutMock: vi.fn(),
}));

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class ELKMock {
    layout = layoutMock;
  },
}));

function node(nodeId: string, filePath: string): CodeGraphSnapshot['nodes'][number] {
  return {
    nodeId,
    stableSymbolId: nodeId,
    parentNodeId: null,
    kind: 'function',
    label: nodeId,
    filePath,
    declarationRange: null,
    diffStatus: 'changed',
    isDiffNode: true,
    changedLineNumbers: [],
    badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
  };
}

function graph(): CodeGraphSnapshot {
  return {
    graphSnapshotId: 'graph-1',
    revisionId: 'revision-1',
    scopeKey: 'initial:diff-plus-1-hop:v1',
    status: 'ready',
    nodes: [
      node('route', 'main/routes/foo.ts'),
      node('domain', 'main/domain/foo.ts'),
      node('unknown', 'tools/foo.ts'),
    ],
    edges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'route',
        targetNodeId: 'domain',
        kind: 'calls',
        confidence: 'high',
      },
    ],
    companionFiles: [],
    limits: {
      nodeLimit: 150,
      edgeLimit: 300,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function profile(): RepositoryLayerProfile {
  return {
    layerProfileId: 'layer-profile-1',
    repositoryProfileId: 'repo-profile-1',
    repositoryIdentityKey: 'identity-1',
    schemaVersion: 1,
    profileVersion: 1,
    displayName: 'Layers',
    layoutDirection: 'RIGHT',
    dependencyDirection: 'order-ascending',
    layoutStrategy: 'lane-composition',
    rules: [
      {
        layerRuleId: 'domain-rule',
        glob: 'main/domain/**',
        layerPath: 'backend/domain',
        displayName: 'domain',
        description: null,
        order: 200,
        priority: 10,
        enabled: true,
      },
      {
        layerRuleId: 'route-rule',
        glob: 'main/routes/**',
        layerPath: 'backend/route',
        displayName: 'route',
        description: null,
        order: 100,
        priority: 10,
        enabled: true,
      },
    ],
    ignoredPatterns: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastAppliedAt: null,
  };
}

function classification(
  nodeId: string,
  status: GraphNodeLayerClassification['status'],
  layerPath: string | null,
): GraphNodeLayerClassification {
  return {
    nodeId,
    filePath: `${nodeId}.ts`,
    normalizedFilePath: `${nodeId}.ts`,
    status,
    layerPath,
    layerRuleId: null,
    matchedLayerRuleIds: [],
    conflictingLayerRuleIds: [],
    ignoredPatternId: null,
  };
}

describe('LayeredLayoutService', () => {
  beforeEach(() => {
    layoutMock.mockReset();
    layoutMock.mockImplementation(
      async (input: { children?: Array<{ id: string; width?: number; height?: number }> }) => ({
        children: (input.children ?? []).map((child, index: number) => ({
          id: child.id,
          x: index * 10,
          y: index * 20,
          width: child.width,
          height: child.height,
        })),
      }),
    );
  });

  it('composes fixed lanes by ascending layer order and places unclassified lane at the right', async () => {
    const result = await new LayeredLayoutService().layout({
      graph: graph(),
      profile: profile(),
      nodeClassifications: {
        route: classification('route', 'classified', 'backend/route'),
        domain: classification('domain', 'classified', 'backend/domain'),
        unknown: classification('unknown', 'unclassified', null),
      },
    });

    expect(result.lanes.map((lane) => lane.layerPath)).toEqual([
      'backend/route',
      'backend/domain',
      'unclassified',
    ]);
    expect(result.lanes[0].bounds.x).toBeLessThan(result.lanes[1].bounds.x);
    expect(result.lanes[1].bounds.x).toBeLessThan(result.lanes[2].bounds.x);
    expect(result.positions.route.x).toBeLessThan(result.positions.domain.x);
    expect(result.positions.domain.x).toBeLessThan(result.positions.unknown.x);
    expect(result.groups[0]).toMatchObject({
      layerPath: 'backend',
      childLaneIds: ['layer-lane:backend/route', 'layer-lane:backend/domain'],
    });
  });

  it('falls back per lane when ELK fails and keeps the graph displayable', async () => {
    layoutMock.mockRejectedValueOnce(new Error('elk failed'));

    const result = await new LayeredLayoutService().layout({
      graph: graph(),
      profile: profile(),
      nodeClassifications: {
        route: classification('route', 'classified', 'backend/route'),
        domain: classification('domain', 'classified', 'backend/domain'),
        unknown: classification('unknown', 'unclassified', null),
      },
    });

    expect(result.positions.route).toMatchObject({ width: 260, height: 60 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LAYER_LAYOUT_FAILED_FALLBACK_GRID',
        severity: 'warning',
      }),
    );
  });

  it('keeps external ignored and out-of-scope nodes out of the unclassified lane', async () => {
    const result = await new LayeredLayoutService().layout({
      graph: {
        ...graph(),
        nodes: [
          ...graph().nodes,
          node('external-lib', 'node_modules/lib/index.d.ts'),
          node('ignored-test', 'main/domain/foo.test.ts'),
          node('out-of-scope', 'dist/foo.js'),
        ],
      },
      profile: profile(),
      nodeClassifications: {
        route: classification('route', 'classified', 'backend/route'),
        domain: classification('domain', 'classified', 'backend/domain'),
        unknown: classification('unknown', 'unclassified', null),
        'external-lib': classification('external-lib', 'external', null),
        'ignored-test': classification('ignored-test', 'ignored', null),
        'out-of-scope': classification('out-of-scope', 'outOfScope', null),
      },
    });

    const unclassifiedLane = result.lanes.find((lane) => lane.unclassified);
    expect(unclassifiedLane?.nodeIds).toEqual(['unknown']);
    expect(result.positions['external-lib'].x).toBeGreaterThan(result.positions.unknown.x);
    expect(result.positions['ignored-test'].x).toBeGreaterThan(result.positions.unknown.x);
    expect(result.positions['out-of-scope'].x).toBeGreaterThan(result.positions.unknown.x);
    expect(
      new Set(
        ['external-lib', 'ignored-test', 'out-of-scope'].map((nodeId) => {
          const position = result.positions[nodeId];
          return `${position.x}:${position.y}`;
        }),
      ).size,
    ).toBe(3);
  });
});
