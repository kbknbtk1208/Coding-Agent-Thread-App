'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LoadNodeDetailResult,
  NodeDetailViewMode,
  NodeDetailSnapshot,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export type NodeDetailState =
  | { status: 'idle'; nodeId: null; detail: null; message: null }
  | {
      status: 'loading';
      nodeId: string;
      detail: NodeDetailSnapshot | null;
      message: string | null;
    }
  | { status: 'ready'; nodeId: string; detail: NodeDetailSnapshot; message: null }
  | {
      status: 'failed';
      nodeId: string;
      detail: NodeDetailSnapshot | null;
      message: string;
    };

const IDLE_STATE: NodeDetailState = {
  status: 'idle',
  nodeId: null,
  detail: null,
  message: null,
};

export interface UseNodeDetailOptions {
  reviewWorkspaceId: string | null;
  scopeKey?: string;
  graphSnapshotId?: string | null;
  selectedNodeId: string | null;
  viewMode?: NodeDetailViewMode;
  refreshKey?: number;
}

export interface UseNodeDetailResult {
  state: NodeDetailState;
  reset(): void;
}

export type NodeDetailCacheKey = `${string}::${NodeDetailViewMode}`;

export interface SnapshotNodeDetailCache {
  detailsByNodeAndMode: Map<NodeDetailCacheKey, NodeDetailSnapshot>;
}

export interface ScopeNodeDetailCache {
  activeGraphSnapshotId: string | null;
  snapshots: Map<string, SnapshotNodeDetailCache>;
}

export type NodeDetailCacheRoot = Map<string, ScopeNodeDetailCache>;

export function buildScopeCacheKey(workspaceId: string, scopeKey: string | undefined): string {
  return `${workspaceId}::${scopeKey ?? ''}`;
}

export function buildNodeDetailCacheKey(
  nodeId: string,
  viewMode: NodeDetailViewMode,
): NodeDetailCacheKey {
  return `${nodeId}::${viewMode}`;
}

export function createNodeDetailCacheRoot(): NodeDetailCacheRoot {
  return new Map();
}

export function getScopeNodeDetailCache(
  root: NodeDetailCacheRoot,
  workspaceId: string,
  scopeKey: string | undefined,
): ScopeNodeDetailCache {
  const scopeCacheKey = buildScopeCacheKey(workspaceId, scopeKey);
  const existing = root.get(scopeCacheKey);
  if (existing) {
    return existing;
  }

  const nextCache: ScopeNodeDetailCache = {
    activeGraphSnapshotId: null,
    snapshots: new Map(),
  };
  root.set(scopeCacheKey, nextCache);
  return nextCache;
}

export function retainOnlyActiveSnapshot(
  scopeCache: ScopeNodeDetailCache,
  graphSnapshotId: string,
): SnapshotNodeDetailCache {
  if (scopeCache.activeGraphSnapshotId === graphSnapshotId) {
    const active = scopeCache.snapshots.get(graphSnapshotId);
    if (active) {
      return active;
    }
  }

  const activeSnapshot = scopeCache.snapshots.get(graphSnapshotId) ?? {
    detailsByNodeAndMode: new Map<NodeDetailCacheKey, NodeDetailSnapshot>(),
  };
  scopeCache.activeGraphSnapshotId = graphSnapshotId;
  scopeCache.snapshots = new Map([[graphSnapshotId, activeSnapshot]]);
  return activeSnapshot;
}

export function getSnapshotNodeDetailCache(
  scopeCache: ScopeNodeDetailCache,
  graphSnapshotId: string | null | undefined,
): SnapshotNodeDetailCache {
  const snapshotKey = graphSnapshotId ?? '';
  if (graphSnapshotId) {
    return retainOnlyActiveSnapshot(scopeCache, graphSnapshotId);
  }

  let snapshotCache = scopeCache.snapshots.get(snapshotKey);
  if (!snapshotCache) {
    snapshotCache = { detailsByNodeAndMode: new Map() };
    scopeCache.snapshots.set(snapshotKey, snapshotCache);
  }
  return snapshotCache;
}

export function clearActiveSnapshotCache(
  root: NodeDetailCacheRoot,
  workspaceId: string,
  scopeKey: string | undefined,
  graphSnapshotId: string | null | undefined,
) {
  const scopeCache = root.get(buildScopeCacheKey(workspaceId, scopeKey));
  if (!scopeCache) {
    return;
  }

  if (graphSnapshotId) {
    scopeCache.snapshots.delete(graphSnapshotId);
    scopeCache.activeGraphSnapshotId = null;
    return;
  }

  scopeCache.snapshots.clear();
  scopeCache.activeGraphSnapshotId = null;
}

export function useNodeDetail({
  reviewWorkspaceId,
  scopeKey,
  graphSnapshotId,
  selectedNodeId,
  viewMode = 'function',
  refreshKey,
}: UseNodeDetailOptions): UseNodeDetailResult {
  const [state, setState] = useState<NodeDetailState>(IDLE_STATE);
  const activeRequestRef = useRef<{
    workspaceId: string;
    scopeKey: string | undefined;
    graphSnapshotId: string | null | undefined;
    nodeId: string;
    viewMode: NodeDetailViewMode;
    refreshKey: number | undefined;
  } | null>(null);
  const cacheRef = useRef<NodeDetailCacheRoot>(createNodeDetailCacheRoot());
  const prevRefreshKeyRef = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    activeRequestRef.current = null;
    setState(IDLE_STATE);
  }, []);

  useEffect(() => {
    if (!reviewWorkspaceId || !scopeKey || !graphSnapshotId) {
      return;
    }

    const scopeCache = getScopeNodeDetailCache(cacheRef.current, reviewWorkspaceId, scopeKey);
    retainOnlyActiveSnapshot(scopeCache, graphSnapshotId);
  }, [graphSnapshotId, reviewWorkspaceId, scopeKey]);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey !== 0 && prevRefreshKeyRef.current !== refreshKey) {
      prevRefreshKeyRef.current = refreshKey;
      if (reviewWorkspaceId) {
        clearActiveSnapshotCache(cacheRef.current, reviewWorkspaceId, scopeKey, graphSnapshotId);
      }
    }

    if (!reviewWorkspaceId || !selectedNodeId) {
      activeRequestRef.current = null;
      setState(IDLE_STATE);
      return;
    }

    const scopeCache = getScopeNodeDetailCache(cacheRef.current, reviewWorkspaceId, scopeKey);
    const snapshotCache = getSnapshotNodeDetailCache(scopeCache, graphSnapshotId);
    const cacheKey = buildNodeDetailCacheKey(selectedNodeId, viewMode);
    const fallbackKey =
      viewMode !== 'function' ? buildNodeDetailCacheKey(selectedNodeId, 'function') : null;
    const cachedDetail =
      snapshotCache.detailsByNodeAndMode.get(cacheKey) ??
      (fallbackKey ? (snapshotCache.detailsByNodeAndMode.get(fallbackKey) ?? null) : null);

    const request = {
      workspaceId: reviewWorkspaceId,
      scopeKey,
      graphSnapshotId,
      nodeId: selectedNodeId,
      viewMode,
      refreshKey,
    };
    activeRequestRef.current = request;
    setState({
      status: 'loading',
      nodeId: selectedNodeId,
      detail: cachedDetail,
      message: cachedDetail ? 'Refreshing node detail…' : null,
    });

    void (async () => {
      let result: LoadNodeDetailResult;
      try {
        result = await window.poc3GraphReviewApi.loadNodeDetail({
          reviewWorkspaceId,
          scopeKey,
          nodeId: selectedNodeId,
          viewMode,
        });
      } catch (err) {
        if (
          activeRequestRef.current?.workspaceId !== request.workspaceId ||
          activeRequestRef.current?.scopeKey !== request.scopeKey ||
          activeRequestRef.current?.graphSnapshotId !== request.graphSnapshotId ||
          activeRequestRef.current?.nodeId !== request.nodeId ||
          activeRequestRef.current?.viewMode !== request.viewMode ||
          activeRequestRef.current?.refreshKey !== request.refreshKey
        ) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Node detail の取得に失敗しました。';
        setState({
          status: 'failed',
          nodeId: selectedNodeId,
          detail: cachedDetail,
          message,
        });
        return;
      }
      if (
        activeRequestRef.current?.workspaceId !== request.workspaceId ||
        activeRequestRef.current?.scopeKey !== request.scopeKey ||
        activeRequestRef.current?.graphSnapshotId !== request.graphSnapshotId ||
        activeRequestRef.current?.nodeId !== request.nodeId ||
        activeRequestRef.current?.viewMode !== request.viewMode ||
        activeRequestRef.current?.refreshKey !== request.refreshKey
      ) {
        return;
      }
      if (result.ok) {
        snapshotCache.detailsByNodeAndMode.set(cacheKey, result.detail);
        setState({ status: 'ready', nodeId: selectedNodeId, detail: result.detail, message: null });
        return;
      }
      setState({
        status: 'failed',
        nodeId: selectedNodeId,
        detail: result.detail ?? cachedDetail,
        message: result.message,
      });
    })();
  }, [graphSnapshotId, refreshKey, reviewWorkspaceId, scopeKey, selectedNodeId, viewMode]);

  return { state, reset };
}
