import type { GraphRenderSnapshot } from '../../../shared/poc3-domain/graph';
import { buildGraphRelationIndex, type GraphRelationIndex } from './graph-relation-index';

export function buildRelationIndexCacheKey(
  reviewWorkspaceId: string,
  renderSnapshot: GraphRenderSnapshot,
): string {
  return [
    reviewWorkspaceId,
    renderSnapshot.revisionId,
    renderSnapshot.scopeKey,
    renderSnapshot.graphSnapshotId,
    renderSnapshot.nodes.length,
    renderSnapshot.edges.length,
  ].join('::');
}

export interface RelationIndexCacheOptions {
  build?: (snapshot: GraphRenderSnapshot) => GraphRelationIndex;
}

export class GraphRelationIndexCache {
  private readonly store = new Map<string, GraphRelationIndex>();
  private readonly buildFn: (snapshot: GraphRenderSnapshot) => GraphRelationIndex;

  constructor(options: RelationIndexCacheOptions = {}) {
    this.buildFn = options.build ?? buildGraphRelationIndex;
  }

  get(reviewWorkspaceId: string, renderSnapshot: GraphRenderSnapshot): GraphRelationIndex {
    const cacheKey = buildRelationIndexCacheKey(reviewWorkspaceId, renderSnapshot);
    const cached = this.store.get(cacheKey);
    if (cached) return cached;
    const index = this.buildFn(renderSnapshot);
    this.store.set(cacheKey, index);
    return index;
  }

  clearForWorkspace(reviewWorkspaceId: string): void {
    const prefix = `${reviewWorkspaceId}::`;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  has(reviewWorkspaceId: string, renderSnapshot: GraphRenderSnapshot): boolean {
    return this.store.has(buildRelationIndexCacheKey(reviewWorkspaceId, renderSnapshot));
  }
}
