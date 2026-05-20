import { describe, expect, it, vi } from 'vitest';
import type { GraphRenderSnapshot } from '../../../shared/poc3-domain/graph';
import type { GraphRelationIndex } from './graph-relation-index';
import { GraphRelationIndexCache, buildRelationIndexCacheKey } from './graph-relation-index-cache';

function createSnapshot(overrides: Partial<GraphRenderSnapshot>): GraphRenderSnapshot {
  return {
    revisionId: 'rev-1',
    graphSnapshotId: 'snap-1',
    scopeKey: 'scope-1',
    status: 'ready',
    nodes: [],
    edges: [],
    viewport: null,
    limits: {
      nodeLimit: 100,
      edgeLimit: 100,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    ...overrides,
  };
}

const fakeIndex = (label: string): GraphRelationIndex =>
  ({ label }) as unknown as GraphRelationIndex;

describe('GraphRelationIndexCache', () => {
  it('reuses the index when the same snapshot identity is requested', () => {
    const build = vi.fn((snapshot: GraphRenderSnapshot) =>
      fakeIndex(`${snapshot.graphSnapshotId}:1`),
    );
    const cache = new GraphRelationIndexCache({ build });
    const snapshot = createSnapshot({});

    const first = cache.get('ws-1', snapshot);
    const second = cache.get('ws-1', snapshot);

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('rebuilds when the graph snapshot id changes', () => {
    const build = vi.fn((snapshot: GraphRenderSnapshot) =>
      fakeIndex(`${snapshot.graphSnapshotId}`),
    );
    const cache = new GraphRelationIndexCache({ build });

    const first = cache.get('ws-1', createSnapshot({ graphSnapshotId: 'snap-1' }));
    const second = cache.get('ws-1', createSnapshot({ graphSnapshotId: 'snap-2' }));

    expect(second).not.toBe(first);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when node or edge count differs (layer on/off, reveal etc)', () => {
    const build = vi.fn((snapshot: GraphRenderSnapshot) =>
      fakeIndex(`n=${snapshot.nodes.length},e=${snapshot.edges.length}`),
    );
    const cache = new GraphRelationIndexCache({ build });

    const minimal = createSnapshot({
      nodes: [{ nodeId: 'a' } as GraphRenderSnapshot['nodes'][number]],
      edges: [],
    });
    const withMore = createSnapshot({
      nodes: [
        { nodeId: 'a' } as GraphRenderSnapshot['nodes'][number],
        { nodeId: 'b' } as GraphRenderSnapshot['nodes'][number],
      ],
      edges: [{ edgeId: 'e1' } as GraphRenderSnapshot['edges'][number]],
    });
    cache.get('ws-1', minimal);
    cache.get('ws-1', withMore);

    expect(build).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(2);
  });

  it('clears entries for a workspace only', () => {
    const build = vi.fn((snapshot: GraphRenderSnapshot) => fakeIndex(snapshot.graphSnapshotId));
    const cache = new GraphRelationIndexCache({ build });

    cache.get('ws-1', createSnapshot({ graphSnapshotId: 'snap-1' }));
    cache.get('ws-2', createSnapshot({ graphSnapshotId: 'snap-9' }));
    cache.clearForWorkspace('ws-1');

    expect(cache.has('ws-1', createSnapshot({ graphSnapshotId: 'snap-1' }))).toBe(false);
    expect(cache.has('ws-2', createSnapshot({ graphSnapshotId: 'snap-9' }))).toBe(true);
  });

  it('rebuilds after explicit clear', () => {
    const build = vi.fn((snapshot: GraphRenderSnapshot) => fakeIndex(snapshot.graphSnapshotId));
    const cache = new GraphRelationIndexCache({ build });
    const snapshot = createSnapshot({});

    cache.get('ws-1', snapshot);
    cache.clear();
    cache.get('ws-1', snapshot);

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('builds different keys for different workspaces / revisions / scopes', () => {
    const baseSnapshot = createSnapshot({});
    expect(buildRelationIndexCacheKey('ws-1', baseSnapshot)).not.toBe(
      buildRelationIndexCacheKey('ws-2', baseSnapshot),
    );
    expect(buildRelationIndexCacheKey('ws-1', baseSnapshot)).not.toBe(
      buildRelationIndexCacheKey('ws-1', createSnapshot({ revisionId: 'rev-9' })),
    );
    expect(buildRelationIndexCacheKey('ws-1', baseSnapshot)).not.toBe(
      buildRelationIndexCacheKey('ws-1', createSnapshot({ scopeKey: 'scope-9' })),
    );
  });
});
