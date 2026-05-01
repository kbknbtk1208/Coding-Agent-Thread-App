'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  RefreshWorkspaceRevisionsResult,
  WorkspaceRevisionView,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';

export function useCommitRevisions(
  selectedWorkspace: ReviewWorkspaceListItem | null,
  onGraphInvalidated?: () => void,
) {
  const [revisionView, setRevisionView] = useState<WorkspaceRevisionView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const selectedWorkspaceId = selectedWorkspace?.reviewWorkspaceId ?? null;

  const load = useCallback(async () => {
    if (!selectedWorkspaceId) {
      setRevisionView(null);
      setRefreshError(null);
      return;
    }
    const result = await window.poc3GraphReviewApi.loadWorkspaceRevisions({
      reviewWorkspaceId: selectedWorkspaceId,
    });
    if (result.ok) {
      setRevisionView(result.view);
      setRefreshError(null);
    } else {
      setRevisionView(null);
      setRefreshError(result.message);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    const unsubscribe = window.poc3GraphReviewApi.onRevisionRefreshEvent((event) => {
      if (
        event.type === 'revision.refresh.snapshot' &&
        event.refresh.reviewWorkspaceId === selectedWorkspaceId
      ) {
        setRevisionView((current) =>
          current
            ? {
                ...current,
                latestRefresh: event.refresh,
              }
            : current,
        );
      }
    });
    return unsubscribe;
  }, [selectedWorkspaceId]);

  const refresh = useCallback(async (): Promise<RefreshWorkspaceRevisionsResult | null> => {
    if (!selectedWorkspaceId) {
      return null;
    }
    setRefreshing(true);
    setRefreshError(null);
    try {
      const previousActive = revisionView?.activeRevisionId ?? null;
      const result = await window.poc3GraphReviewApi.refreshWorkspaceRevisions({
        reviewWorkspaceId: selectedWorkspaceId,
      });
      if (result.ok) {
        setRevisionView(result.view);
        if (shouldInvalidateGraphAfterRefresh(result, previousActive)) {
          onGraphInvalidated?.();
        }
      } else {
        setRevisionView(result.view);
        setRefreshError(result.message);
      }
      return result;
    } finally {
      setRefreshing(false);
    }
  }, [onGraphInvalidated, revisionView?.activeRevisionId, selectedWorkspaceId]);

  const selectRevision = useCallback(
    async (revisionId: string) => {
      if (!selectedWorkspaceId) {
        return;
      }
      const result = await window.poc3GraphReviewApi.selectWorkspaceRevision({
        reviewWorkspaceId: selectedWorkspaceId,
        revisionId,
      });
      if (result.ok) {
        setRevisionView(result.view);
        onGraphInvalidated?.();
      } else {
        setRefreshError(result.message);
      }
    },
    [onGraphInvalidated, selectedWorkspaceId],
  );

  return useMemo(
    () => ({
      revisionView,
      refreshing,
      refreshError,
      refresh,
      selectRevision,
      reload: load,
    }),
    [load, refresh, refreshError, refreshing, revisionView, selectRevision],
  );
}

export function shouldInvalidateGraphAfterRefresh(
  result: RefreshWorkspaceRevisionsResult,
  previousActiveRevisionId: string | null,
): boolean {
  if (!result.ok) {
    return false;
  }
  if (result.view.activeRevisionId !== previousActiveRevisionId) {
    return true;
  }
  if (result.refresh.createdRevisionId) {
    return true;
  }
  return result.refresh.status === 'completed';
}
