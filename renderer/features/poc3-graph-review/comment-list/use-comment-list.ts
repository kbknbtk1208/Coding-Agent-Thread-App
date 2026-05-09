'use client';

import { useEffect, useRef, useState } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
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
  graph: GraphRenderSnapshot,
  reviewWorkspaceId: string,
): UseCommentListResult {
  const [items, setItems] = useState<CommentListItem[]>([]);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const lastSnapshotIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastSnapshotIdRef.current === graph.graphSnapshotId) return;
    const snapshotId = graph.graphSnapshotId;
    lastSnapshotIdRef.current = snapshotId;

    const nodesWithComments = graph.nodes.filter(
      (n) => n.badges.findingCount > 0 || n.badges.remoteThreadCount > 0,
    );

    if (nodesWithComments.length === 0) {
      setItems([]);
      setRevisionId(null);
      return;
    }

    void Promise.all(
      nodesWithComments.map((node) =>
        window.poc3GraphReviewApi.loadNodeDetail({
          reviewWorkspaceId,
          scopeKey: graph.scopeKey,
          nodeId: node.nodeId,
        }),
      ),
    ).then((results) => {
      if (lastSnapshotIdRef.current !== snapshotId) return;

      const collected: CommentListItem[] = [];
      const seen = new Set<string>();
      let resolvedRevisionId: string | null = null;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const node = nodesWithComments[i];
        if (!result.ok || !result.detail) continue;

        const { detail } = result;
        if (!resolvedRevisionId) {
          resolvedRevisionId = detail.revisionId;
        }

        for (const finding of detail.findings) {
          const key = `agent:${finding.localThreadId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push({
            key,
            type: 'agent',
            nodeId: node.nodeId,
            commentKey: {
              reviewWorkspaceId,
              revisionId: detail.revisionId,
              commentType: 'agent-thread',
              commentId: finding.localThreadId,
            },
            title: finding.title,
            filePath: detail.node.filePath,
            line: finding.line,
            publishedRemoteCount: finding.publishedRemoteThreads.filter(
              (item) => item.status === 'active' && item.remoteThread,
            ).length,
          });
        }

        for (const thread of detail.threads.remote) {
          const { location } = thread;
          const key = `remote:${thread.providerThreadId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push({
            key,
            type: 'remote',
            nodeId: node.nodeId,
            commentKey: {
              reviewWorkspaceId,
              revisionId: detail.revisionId,
              commentType: 'remote-thread',
              commentId: thread.providerThreadId,
            },
            title: thread.comments[0]?.body ?? '',
            filePath: location.kind === 'diff' ? location.filePath : detail.node.filePath,
            line: location.kind === 'diff' ? location.startLine : null,
          });
        }
      }

      setItems(collected);
      setRevisionId(resolvedRevisionId);
    });
  }, [graph.graphSnapshotId, graph.nodes, graph.scopeKey, reviewWorkspaceId]);

  return { items, revisionId };
}
