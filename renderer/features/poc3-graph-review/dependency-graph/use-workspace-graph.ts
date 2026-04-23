'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GraphAnalysisEvent,
  LoadWorkspaceGraphResult,
  RetryGraphAnalysisResult,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';

export type WorkspaceGraphLoadState =
  | { status: 'idle'; result: null; message: null }
  | { status: 'loading'; result: null; message: string | null }
  | { status: 'ready'; result: Extract<LoadWorkspaceGraphResult, { ok: true }>; message: null }
  | {
      status: 'notReady' | 'failed' | 'missing';
      result: Extract<LoadWorkspaceGraphResult, { ok: false }>;
      message: string;
    };

export function useWorkspaceGraph(selectedWorkspace: ReviewWorkspaceListItem | null) {
  const [state, setState] = useState<WorkspaceGraphLoadState>({
    status: 'idle',
    result: null,
    message: null,
  });
  const selectedWorkspaceId = selectedWorkspace?.reviewWorkspaceId ?? null;

  const load = useCallback(async () => {
    if (!selectedWorkspaceId) {
      setState({ status: 'idle', result: null, message: null });
      return;
    }
    setState({ status: 'loading', result: null, message: null });
    const result = await window.poc3GraphReviewApi.loadWorkspaceGraph({
      reviewWorkspaceId: selectedWorkspaceId,
    });
    if (result.ok) {
      setState({ status: 'ready', result, message: null });
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
  }, [selectedWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return useMemo(
    () => ({
      state,
      reload: load,
      retry,
    }),
    [load, retry, state],
  );
}
