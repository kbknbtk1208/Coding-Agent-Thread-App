'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GraphAnalysisEvent,
  OpenWorkspaceInEditorResult,
  RemoveReviewWorkspaceInput,
  RemoveReviewWorkspaceResult,
  WorkspaceCreationEvent,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export type ReviewWorkspaceListItem = Awaited<
  ReturnType<typeof window.poc3GraphReviewApi.listReviewWorkspaces>
>['workspaces'][number];

export function isReviewWorkspaceSelectable(workspace: ReviewWorkspaceListItem): boolean {
  return workspace.analysisStatus === 'completed' && workspace.worktreeExists;
}

export function useReviewWorkspaces() {
  const [workspaces, setWorkspaces] = useState<ReviewWorkspaceListItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [removingWorkspaceId, setRemovingWorkspaceId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [openingWorkspaceIds, setOpeningWorkspaceIds] = useState<Record<string, true>>({});
  const [openEditorErrorByWorkspaceId, setOpenEditorErrorByWorkspaceId] = useState<
    Record<string, string>
  >({});
  const hydratedRef = useRef(false);
  const removingWorkspaceIdRef = useRef<string | null>(null);
  const openingWorkspaceIdsRef = useRef<Set<string>>(new Set());

  const hydrate = useCallback(async () => {
    const result = await window.poc3GraphReviewApi.listReviewWorkspaces();
    setWorkspaces(result.workspaces);
    setOpenEditorErrorByWorkspaceId((current) => {
      const existingIds = new Set(
        result.workspaces.map((workspace) => workspace.reviewWorkspaceId),
      );
      return Object.fromEntries(
        Object.entries(current).filter(([reviewWorkspaceId]) => existingIds.has(reviewWorkspaceId)),
      );
    });
    setSelectedWorkspaceId((current) => {
      if (
        current &&
        result.workspaces.some(
          (workspace) =>
            workspace.reviewWorkspaceId === current && isReviewWorkspaceSelectable(workspace),
        )
      ) {
        return current;
      }
      return result.workspaces.find(isReviewWorkspaceSelectable)?.reviewWorkspaceId ?? null;
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
    const unsubscribeGraph = window.poc3GraphReviewApi.onGraphAnalysisEvent((event) => {
      if (shouldHydrateWorkspaceListForGraphEvent(event)) {
        void hydrate();
      }
    });
    return () => {
      unsubscribe();
      unsubscribeGraph();
    };
  }, [hydrate]);

  const removeWorkspace = useCallback(
    async (
      reviewWorkspaceId: string,
      options: Pick<RemoveReviewWorkspaceInput, 'force' | 'purgeDbOnly'> = {},
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
          purgeDbOnly: options.purgeDbOnly,
        });
        if (result.ok) {
          await hydrate();
          return result;
        }
        if (result.reason !== 'forceRequired' && result.reason !== 'lockHeld') {
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

  const openWorkspaceInEditor = useCallback(
    async (reviewWorkspaceId: string): Promise<OpenWorkspaceInEditorResult> => {
      if (openingWorkspaceIdsRef.current.has(reviewWorkspaceId)) {
        return { ok: true };
      }
      openingWorkspaceIdsRef.current.add(reviewWorkspaceId);
      setOpeningWorkspaceIds((current) => ({ ...current, [reviewWorkspaceId]: true }));
      setOpenEditorErrorByWorkspaceId((current) => {
        const { [reviewWorkspaceId]: _removed, ...rest } = current;
        return rest;
      });
      try {
        const result = await window.poc3GraphReviewApi.openWorkspaceInEditor({
          reviewWorkspaceId,
          editor: 'vscode',
          mode: 'newWindow',
        });
        if (!result.ok) {
          setOpenEditorErrorByWorkspaceId((current) => ({
            ...current,
            [reviewWorkspaceId]: truncateInlineError(result.message),
          }));
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'VS Code の起動に失敗しました。';
        setOpenEditorErrorByWorkspaceId((current) => ({
          ...current,
          [reviewWorkspaceId]: truncateInlineError(message),
        }));
        return {
          ok: false,
          reason: 'launchFailed',
          message,
        };
      } finally {
        openingWorkspaceIdsRef.current.delete(reviewWorkspaceId);
        setOpeningWorkspaceIds((current) => {
          const { [reviewWorkspaceId]: _removed, ...rest } = current;
          return rest;
        });
      }
    },
    [],
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
    openingWorkspaceIds,
    openEditorErrorByWorkspaceId,
    openWorkspaceInEditor,
  };
}

function truncateInlineError(message: string): string {
  return message.length <= 120 ? message : `${message.slice(0, 119)}…`;
}

export function shouldHydrateWorkspaceListForGraphEvent(event: GraphAnalysisEvent): boolean {
  return (
    event.type === 'graph.ready' ||
    (event.type === 'analysis.snapshot' && event.status === 'completed')
  );
}
