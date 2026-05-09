'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  NodeCompanionState,
  NodeDetailViewMode,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewProviderKind } from '../../../../shared/poc3-domain/review-workspace';
import type { UsePublishCommentsReturn } from '../provider-comments/use-publish-comments';
import { LoadingState, ErrorState } from './panel-shell/panel-status';
import { DiffAwareSourceSection } from './diff-source/diff-aware-source-section';
import { useNodeCompanionDetail } from './use-node-companion-detail';

export function CompanionCodePane({
  companion,
  reviewWorkspaceId,
  scopeKey,
  graphSnapshotId,
  ownerNodeId,
  refreshKey,
  publishComments,
  providerKind,
}: {
  companion: NodeCompanionState;
  reviewWorkspaceId: string;
  scopeKey?: string;
  graphSnapshotId?: string | null;
  ownerNodeId: string;
  refreshKey?: number;
  publishComments: UsePublishCommentsReturn;
  providerKind?: ReviewProviderKind;
}) {
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(
    companion.companions[0]?.relationId ?? null,
  );
  const [viewMode, setViewMode] = useState<NodeDetailViewMode>('file');

  useEffect(() => {
    setSelectedRelationId((current) =>
      current && companion.companions.some((item) => item.relationId === current)
        ? current
        : (companion.companions[0]?.relationId ?? null),
    );
  }, [companion]);

  const state = useNodeCompanionDetail({
    reviewWorkspaceId,
    scopeKey,
    graphSnapshotId,
    ownerNodeId,
    relationId: selectedRelationId,
    refreshKey,
  });
  const source = useMemo(() => state.detail?.source ?? null, [state.detail]);

  if (companion.companions.length === 0) {
    return <div className="text-[12px] text-white/55">{companion.emptyMessage}</div>;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {companion.companions.length > 1 ? (
        <select
          className="h-8 cursor-pointer rounded-[7px] border border-white/[0.1] bg-black/35 px-2 text-[12px] text-white outline-none"
          value={selectedRelationId ?? ''}
          onChange={(event) => setSelectedRelationId(event.target.value)}
        >
          {companion.companions.map((item) => (
            <option key={item.relationId} value={item.relationId}>
              {item.filePath}
            </option>
          ))}
        </select>
      ) : null}
      {state.status === 'loading' && !state.detail ? (
        <LoadingState message="Loading companion…" />
      ) : null}
      {state.status === 'failed' && !state.detail ? <ErrorState message={state.message} /> : null}
      {state.detail ? (
        <DiffAwareSourceSection
          detail={state.detail}
          source={source}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          publishComments={publishComments}
          providerKind={providerKind}
        />
      ) : null}
    </div>
  );
}
