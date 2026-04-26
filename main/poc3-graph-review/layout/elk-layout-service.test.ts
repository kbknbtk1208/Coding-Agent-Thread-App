import { describe, expect, it, vi } from 'vitest';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import { layoutGraph, fallbackGridLayout } from './elk-layout-service';

const { layoutMock } = vi.hoisted(() => ({
  layoutMock: vi.fn(),
}));

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class ELKMock {
    layout = layoutMock;
  },
}));

function createGraph(): CodeGraphSnapshot {
  return {
    graphSnapshotId: 'graph-1',
    revisionId: 'revision-1',
    scopeKey: 'initial:diff-plus-1-hop:v1',
    status: 'ready',
    nodes: [
      {
        nodeId: 'module-app',
        stableSymbolId: 'module-app',
        parentNodeId: null,
        kind: 'module',
        label: 'App.tsx',
        filePath: 'src/App.tsx',
        declarationRange: {
          filePath: 'src/App.tsx',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        diffStatus: 'module',
        isDiffNode: false,
        badges: { changedLines: 4, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'component-app',
        stableSymbolId: 'component-app',
        parentNodeId: 'module-app',
        kind: 'component',
        label: 'App',
        filePath: 'src/App.tsx',
        declarationRange: {
          filePath: 'src/App.tsx',
          startLine: 10,
          startColumn: 1,
          endLine: 20,
          endColumn: 1,
        },
        diffStatus: 'changed',
        isDiffNode: true,
        badges: { changedLines: 4, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'hook-useThing',
        stableSymbolId: 'hook-useThing',
        parentNodeId: null,
        kind: 'hook',
        label: 'useThing',
        filePath: 'src/useThing.ts',
        declarationRange: {
          filePath: 'src/useThing.ts',
          startLine: 5,
          startColumn: 1,
          endLine: 15,
          endColumn: 1,
        },
        diffStatus: 'related',
        isDiffNode: false,
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
    ],
    edges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'component-app',
        targetNodeId: 'hook-useThing',
        kind: 'calls',
        confidence: 'high',
      },
    ],
    limits: {
      nodeLimit: 150,
      edgeLimit: 400,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('fallbackGridLayout', () => {
  it('ノード間隔を広めに確保する', () => {
    const positions = fallbackGridLayout(createGraph());

    expect(positions['module-app']).toMatchObject({ x: 0, y: 0, width: 320, height: 72 });
    expect(positions['component-app']).toMatchObject({ x: 420, y: 0, width: 260, height: 60 });
    expect(positions['hook-useThing']).toMatchObject({ x: 0, y: 220, width: 260, height: 60 });
  });
});

describe('layoutGraph', () => {
  it('ELK レイアウトにも広い間隔設定を渡す', async () => {
    layoutMock.mockResolvedValueOnce({
      children: [
        { id: 'module-app', x: 0, y: 0, width: 320, height: 72 },
        { id: 'component-app', x: 480, y: 0, width: 260, height: 60 },
        { id: 'hook-useThing', x: 900, y: 0, width: 260, height: 60 },
      ],
    });

    const result = await layoutGraph(createGraph());

    expect(layoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        layoutOptions: expect.objectContaining({
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '160',
          'elk.spacing.nodeNode': '96',
        }),
      }),
    );
    expect(result.layout.positions['component-app']).toMatchObject({ x: 480, y: 0 });
  });
});
