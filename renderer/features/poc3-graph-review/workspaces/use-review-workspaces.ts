'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceCreationEvent } from '../../../../shared/poc3-contracts/graph-review-ipc';

export type ReviewWorkspaceListItem = Awaited<
  ReturnType<typeof window.poc3GraphReviewApi.listReviewWorkspaces>
>['workspaces'][number];

export function useReviewWorkspaces() {
  const [workspaces, setWorkspaces] = useState<ReviewWorkspaceListItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const hydrate = useCallback(async () => {
    const result = await window.poc3GraphReviewApi.listReviewWorkspaces();
    setWorkspaces(result.workspaces);
    setSelectedWorkspaceId((current) => {
      if (
        current &&
        result.workspaces.some((workspace) => workspace.reviewWorkspaceId === current)
      ) {
        return current;
      }
      return result.workspaces[0]?.reviewWorkspaceId ?? null;
    });
  }, []);

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    void hydrate();

    const unsubscribe = window.poc3GraphReviewApi.onWorkspaceCreationEvent(
      (event: WorkspaceCreationEvent) => {
        if (
          event.type === 'snapshot' &&
          event.job.status === 'completed' &&
          event.job.reviewWorkspaceId
        ) {
          void hydrate();
        }
      },
    );
    return unsubscribe;
  }, [hydrate]);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.reviewWorkspaceId === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );

  const otherWorkspaces = useMemo(
    () =>
      selectedWorkspace
        ? workspaces.filter(
            (workspace) => workspace.reviewWorkspaceId !== selectedWorkspace.reviewWorkspaceId,
          )
        : workspaces,
    [selectedWorkspace, workspaces],
  );

  return {
    workspaces,
    selectedWorkspace,
    otherWorkspaces,
    selectWorkspace: setSelectedWorkspaceId,
  };
}
