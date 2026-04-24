'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LoadNodeDetailResult,
  NodeDetailSnapshot,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export type NodeDetailState =
  | { status: 'idle'; nodeId: null; detail: null; message: null }
  | { status: 'loading'; nodeId: string; detail: null; message: null }
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
  selectedNodeId: string | null;
}

export interface UseNodeDetailResult {
  state: NodeDetailState;
  reset(): void;
}

export function useNodeDetail({
  reviewWorkspaceId,
  scopeKey,
  selectedNodeId,
}: UseNodeDetailOptions): UseNodeDetailResult {
  const [state, setState] = useState<NodeDetailState>(IDLE_STATE);
  const activeRequestRef = useRef<{ workspaceId: string; nodeId: string } | null>(null);

  const reset = useCallback(() => {
    activeRequestRef.current = null;
    setState(IDLE_STATE);
  }, []);

  useEffect(() => {
    if (!reviewWorkspaceId || !selectedNodeId) {
      activeRequestRef.current = null;
      setState(IDLE_STATE);
      return;
    }
    const request = { workspaceId: reviewWorkspaceId, nodeId: selectedNodeId };
    activeRequestRef.current = request;
    setState({
      status: 'loading',
      nodeId: selectedNodeId,
      detail: null,
      message: null,
    });

    void (async () => {
      let result: LoadNodeDetailResult;
      try {
        result = await window.poc3GraphReviewApi.loadNodeDetail({
          reviewWorkspaceId,
          scopeKey,
          nodeId: selectedNodeId,
        });
      } catch (err) {
        if (
          activeRequestRef.current?.workspaceId !== request.workspaceId ||
          activeRequestRef.current?.nodeId !== request.nodeId
        ) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Node detail の取得に失敗しました。';
        setState({ status: 'failed', nodeId: selectedNodeId, detail: null, message });
        return;
      }
      if (
        activeRequestRef.current?.workspaceId !== request.workspaceId ||
        activeRequestRef.current?.nodeId !== request.nodeId
      ) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', nodeId: selectedNodeId, detail: result.detail, message: null });
        return;
      }
      setState({
        status: 'failed',
        nodeId: selectedNodeId,
        detail: result.detail,
        message: result.message,
      });
    })();
  }, [reviewWorkspaceId, scopeKey, selectedNodeId]);

  return { state, reset };
}
