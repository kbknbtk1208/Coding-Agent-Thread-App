'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RemoveReviewWorkspaceInput,
  RemoveReviewWorkspaceResult,
  WorkspaceCreationEvent,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export type ReviewWorkspaceListItem = Awaited<
  ReturnType<typeof window.poc3GraphReviewApi.listReviewWorkspaces>
>['workspaces'][number];

export function useReviewWorkspaces() {
  const [workspaces, setWorkspaces] = useState<ReviewWorkspaceListItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [removingWorkspaceId, setRemovingWorkspaceId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const removingWorkspaceIdRef = useRef<string | null>(null);

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

  const removeWorkspace = useCallback(
    async (
      reviewWorkspaceId: string,
      options: Pick<RemoveReviewWorkspaceInput, 'force'> = {},
    ): Promise<RemoveReviewWorkspaceResult> => {
      if (removingWorkspaceIdRef.current) {
        const message = 'Workspace の削除処理が進行中です。';
        setRemoveError(message);
        return {
          ok: false,
          reviewWorkspaceId,
          reason: 'gitFailed',
          message,
        };
      }
      removingWorkspaceIdRef.current = reviewWorkspaceId;
      setRemovingWorkspaceId(reviewWorkspaceId);
      setRemoveError(null);
      try {
        const result = await window.poc3GraphReviewApi.removeReviewWorkspace({
          reviewWorkspaceId,
          force: options.force,
        });
        if (result.ok) {
          await hydrate();
          return result;
        }
        if (result.reason !== 'forceRequired') {
          setRemoveError(result.message);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Workspace の削除に失敗しました。';
        setRemoveError(message);
        return {
          ok: false,
          reviewWorkspaceId,
          reason: 'gitFailed',
          message,
        };
      } finally {
        if (removingWorkspaceIdRef.current === reviewWorkspaceId) {
          removingWorkspaceIdRef.current = null;
        }
        setRemovingWorkspaceId((current) => (current === reviewWorkspaceId ? null : current));
      }
    },
    [hydrate],
  );

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
    removingWorkspaceId,
    removeError,
    removeWorkspace,
  };
}
