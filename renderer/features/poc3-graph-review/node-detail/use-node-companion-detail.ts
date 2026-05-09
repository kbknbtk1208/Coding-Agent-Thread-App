'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  LoadNodeCompanionDetailResult,
  NodeCompanionDetailSnapshot,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export type NodeCompanionDetailState =
  | { status: 'idle'; detail: null; message: null }
  | { status: 'loading'; detail: NodeCompanionDetailSnapshot | null; message: string | null }
  | { status: 'ready'; detail: NodeCompanionDetailSnapshot; message: null }
  | { status: 'failed'; detail: NodeCompanionDetailSnapshot | null; message: string };

const IDLE_STATE: NodeCompanionDetailState = { status: 'idle', detail: null, message: null };

export function useNodeCompanionDetail(input: {
  reviewWorkspaceId: string | null;
  scopeKey?: string;
  graphSnapshotId?: string | null;
  ownerNodeId: string | null;
  relationId: string | null;
  refreshKey?: number;
}): NodeCompanionDetailState {
  const [state, setState] = useState<NodeCompanionDetailState>(IDLE_STATE);
  const cacheRef = useRef(new Map<string, NodeCompanionDetailSnapshot>());
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!input.graphSnapshotId) {
      cacheRef.current.clear();
    }
  }, [input.graphSnapshotId]);

  useEffect(() => {
    const { reviewWorkspaceId, scopeKey, graphSnapshotId, ownerNodeId, relationId } = input;
    if (!reviewWorkspaceId || !ownerNodeId || !relationId) {
      activeKeyRef.current = null;
      setState(IDLE_STATE);
      return;
    }
    const cacheKey = `${graphSnapshotId ?? ''}::${ownerNodeId}::${relationId}`;
    const cached = cacheRef.current.get(cacheKey) ?? null;
    activeKeyRef.current = cacheKey;
    setState({
      status: 'loading',
      detail: cached,
      message: cached ? 'Refreshing companion…' : null,
    });

    void (async () => {
      let result: LoadNodeCompanionDetailResult;
      try {
        result = await window.poc3GraphReviewApi.loadNodeCompanionDetail({
          reviewWorkspaceId,
          scopeKey,
          ownerNodeId,
          relationId,
        });
      } catch (err) {
        if (activeKeyRef.current !== cacheKey) return;
        setState({
          status: 'failed',
          detail: cached,
          message: err instanceof Error ? err.message : '対応ファイルの取得に失敗しました。',
        });
        return;
      }
      if (activeKeyRef.current !== cacheKey) return;
      if (result.ok) {
        cacheRef.current.set(cacheKey, result.detail);
        setState({ status: 'ready', detail: result.detail, message: null });
        return;
      }
      setState({ status: 'failed', detail: result.detail ?? cached, message: result.message });
    })();
  }, [
    input.graphSnapshotId,
    input.ownerNodeId,
    input.refreshKey,
    input.relationId,
    input.reviewWorkspaceId,
    input.scopeKey,
  ]);

  return state;
}
