'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GraphAnalysisEvent,
  LoadWorkspaceGraphViewResult,
  RetryGraphAnalysisResult,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';

export type WorkspaceGraphLoadState =
  | { status: 'idle'; result: null; message: null }
  | { status: 'loading'; result: null; message: string | null }
  | { status: 'ready'; result: Extract<LoadWorkspaceGraphViewResult, { ok: true }>; message: null }
  | {
      status: 'notReady' | 'failed' | 'missing';
      result: Extract<LoadWorkspaceGraphViewResult, { ok: false }>;
      message: string;
    };

export function useWorkspaceGraph(
  selectedWorkspace: ReviewWorkspaceListItem | null,
  reloadNonce = 0,
  options: { includeLayers?: boolean; revealedNodeIds?: string[] } = {},
) {
  const [state, setState] = useState<WorkspaceGraphLoadState>({
    status: 'idle',
    result: null,
    message: null,
  });
  const selectedWorkspaceId = selectedWorkspace?.reviewWorkspaceId ?? null;
  const includeLayers = options.includeLayers ?? true;
  const revealedNodeIdsKey = (options.revealedNodeIds ?? []).slice().sort().join('\0');
  const [layerWarningMessage, setLayerWarningMessage] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const loadedWorkspaceIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedWorkspaceId) {
      loadSeqRef.current += 1;
      loadedWorkspaceIdRef.current = null;
      setState({ status: 'idle', result: null, message: null });
      setLayerWarningMessage(null);
      return;
    }
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const workspaceChanged = loadedWorkspaceIdRef.current !== selectedWorkspaceId;
    if (workspaceChanged) {
      setState({ status: 'loading', result: null, message: null });
    } else {
      setState((current) =>
        current.status === 'ready' ? current : { status: 'loading', result: null, message: null },
      );
    }
    const result = await window.poc3GraphReviewApi.loadWorkspaceGraphView({
      reviewWorkspaceId: selectedWorkspaceId,
      includeLayers,
      mode: revealedNodeIdsKey.length > 0 ? 'revealed' : 'initial',
      revealedNodeIds: revealedNodeIdsKey.length > 0 ? revealedNodeIdsKey.split('\0') : [],
    });
    if (seq !== loadSeqRef.current) {
      return;
    }
    if (result.ok) {
      loadedWorkspaceIdRef.current = selectedWorkspaceId;
      setState({ status: 'ready', result, message: null });
      setLayerWarningMessage(null);
      return;
    }
    if (result.reason === 'analysisFailed') {
      setState({ status: 'failed', result, message: result.message });
      return;
    }
    if (result.reason === 'graphNotReady') {
      setState({ status: 'notReady', result, message: result.message });
      return;
    }
    setState({ status: 'missing', result, message: result.message });
  }, [includeLayers, revealedNodeIdsKey, selectedWorkspaceId]);

  useEffect(() => {
    void load();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [load, reloadNonce]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    const unsubscribe = window.poc3GraphReviewApi.onGraphAnalysisEvent(
      (event: GraphAnalysisEvent) => {
        if (event.type === 'graph.ready') {
          void load();
          return;
        }
        if (
          event.type === 'analysis.snapshot' &&
          (event.status === 'running' || event.status === 'queued')
        ) {
          setState((current) => {
            if (current.status === 'ready') {
              return current;
            }
            return {
              status: 'loading',
              result: null,
              message: event.message,
            };
          });
        }
        if (event.type === 'analysis.snapshot' && event.status === 'failed') {
          void load();
        }
      },
    );
    return unsubscribe;
  }, [load, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    const unsubscribe = window.poc3GraphReviewApi.onLayerApplicationEvent((event) => {
      if (event.reviewWorkspaceId !== selectedWorkspaceId) {
        return;
      }
      if (event.type === 'layer.application.completed') {
        setLayerWarningMessage(null);
        if (includeLayers) {
          void load();
        }
        return;
      }
      if (event.type === 'layer.application.failed') {
        setLayerWarningMessage(event.message);
      }
    });
    return unsubscribe;
  }, [includeLayers, load, selectedWorkspaceId]);

  const retry = useCallback(async (): Promise<RetryGraphAnalysisResult | null> => {
    if (!selectedWorkspaceId) {
      return null;
    }
    const result = await window.poc3GraphReviewApi.retryGraphAnalysis({
      reviewWorkspaceId: selectedWorkspaceId,
    });
    if (result.ok) {
      setState({ status: 'loading', result: null, message: 'Graph analysis queued' });
    }
    return result;
  }, [selectedWorkspaceId]);

  const reload = useCallback(async () => {
    if (!selectedWorkspaceId) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const result = await window.poc3GraphReviewApi.loadWorkspaceGraphView({
      reviewWorkspaceId: selectedWorkspaceId,
      includeLayers,
      mode: revealedNodeIdsKey.length > 0 ? 'revealed' : 'initial',
      revealedNodeIds: revealedNodeIdsKey.length > 0 ? revealedNodeIdsKey.split('\0') : [],
    });
    if (seq !== loadSeqRef.current) {
      return;
    }
    if (result.ok) {
      setState({ status: 'ready', result, message: null });
      setLayerWarningMessage(null);
    }
  }, [includeLayers, revealedNodeIdsKey, selectedWorkspaceId]);

  return useMemo(
    () => ({
      state,
      reload,
      retry,
      layerWarningMessage,
    }),
    [layerWarningMessage, reload, retry, state],
  );
}
