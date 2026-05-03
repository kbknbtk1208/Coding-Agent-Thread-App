'use client';

import { useEffect, useRef, useState } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';

export interface CommentListItem {
  key: string;
  type: 'agent' | 'remote';
  nodeId: string;
  title: string;
  filePath: string | null;
  line: number | null;
}

export function useCommentList(graph: GraphRenderSnapshot, reviewWorkspaceId: string) {
  const [items, setItems] = useState<CommentListItem[]>([]);
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

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const node = nodesWithComments[i];
        if (!result.ok || !result.detail) continue;

        const { detail } = result;

        for (const finding of detail.findings) {
          collected.push({
            key: `agent:${finding.findingId}`,
            type: 'agent',
            nodeId: node.nodeId,
            title: finding.title,
            filePath: detail.node.filePath,
            line: finding.line,
          });
        }

        for (const thread of detail.threads.remote) {
          const { location } = thread;
          collected.push({
            key: `remote:${thread.providerThreadId}`,
            type: 'remote',
            nodeId: node.nodeId,
            title: thread.comments[0]?.body ?? '',
            filePath: location.kind === 'diff' ? location.filePath : detail.node.filePath,
            line: location.kind === 'diff' ? location.startLine : null,
          });
        }
      }

      setItems(collected);
    });
  }, [graph.graphSnapshotId, graph.nodes, graph.scopeKey, reviewWorkspaceId]);

  return items;
}
