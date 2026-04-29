'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GraphAnalysisEvent,
  Poc3OutdatedAgentThread,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export function useOutdatedAgentThreads(reviewWorkspaceId: string) {
  const [threads, setThreads] = useState<Poc3OutdatedAgentThread[]>([]);

  const load = useCallback(async () => {
    const result = await window.poc3GraphReviewApi.listOutdatedAgentThreads({
      reviewWorkspaceId,
    });
    setThreads(result.threads);
  }, [reviewWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.poc3GraphReviewApi.onRevisionRefreshEvent((event) => {
      if (
        event.type === 'revision.refresh.snapshot' &&
        event.refresh.reviewWorkspaceId === reviewWorkspaceId &&
        event.refresh.completedAt
      ) {
        void load();
      }
    });
    return unsubscribe;
  }, [load, reviewWorkspaceId]);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.poc3GraphReviewApi.onGraphAnalysisEvent(
      (event: GraphAnalysisEvent) => {
        if (event.type !== 'graph.ready') {
          return;
        }
        void (async () => {
          const result = await window.poc3GraphReviewApi.loadWorkspaceRevisions({
            reviewWorkspaceId,
          });
          if (!disposed && result.ok && result.view.activeRevisionId === event.revisionId) {
            void load();
          }
        })();
      },
    );
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [load, reviewWorkspaceId]);

  return useMemo(() => ({ threads, reload: load }), [load, threads]);
}
