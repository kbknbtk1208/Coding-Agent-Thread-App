'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResolveJudgementCommentKey } from '../../../../shared/poc3-domain/resolve-judgement';

export interface CommentListItem {
  key: string;
  type: 'agent' | 'remote';
  nodeId: string;
  commentKey: ResolveJudgementCommentKey;
  title: string;
  filePath: string | null;
  line: number | null;
  publishedRemoteCount?: number;
}

export interface UseCommentListResult {
  items: CommentListItem[];
  revisionId: string | null;
}

export function useCommentList(
  reviewWorkspaceId: string,
  scopeKey: string,
  graphSnapshotId: string,
  refreshKey = 0,
): UseCommentListResult {
  const [items, setItems] = useState<CommentListItem[]>([]);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const lastSnapshotIdRef = useRef<string | null>(null);

  useEffect(() => {
    const snapshotId = `${graphSnapshotId}:${String(refreshKey)}`;
    if (lastSnapshotIdRef.current === snapshotId) return;
    lastSnapshotIdRef.current = snapshotId;

    void window.poc3GraphReviewApi
      .listGraphCommentSummaries({
        reviewWorkspaceId,
        scopeKey,
        graphSnapshotId,
      })
      .then((result) => {
        if (lastSnapshotIdRef.current !== snapshotId) return;
        if (!result.ok) {
          setItems([]);
          setRevisionId(null);
          return;
        }
        setItems(result.items);
        setRevisionId(result.revisionId);
      });
  }, [graphSnapshotId, refreshKey, reviewWorkspaceId, scopeKey]);

  return { items, revisionId };
}
