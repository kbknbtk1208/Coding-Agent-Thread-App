import type { CodeGraphNode, CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type {
  Poc3OutdatedAgentThread,
  Poc3ThreadOutdatedReason,
  Poc3ThreadTracking,
  Poc3ThreadTrackingStatus,
} from '../../../shared/poc3-domain/thread-retention';
import type { GraphReviewStore } from '../store/graph-review-store';
import type { Poc3AgentReviewStore } from '../agent/store';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../../shared/poc3-domain/graph';
import type { ReviewChangedFile } from '../../../shared/poc3-domain/source-snapshot';

function nowIso(): string {
  return new Date().toISOString();
}

function threadFilePath(thread: Poc3AgentReviewThread): string | null {
  if (thread.location.kind === 'diff' || thread.location.kind === 'node') {
    return thread.location.filePath;
  }
  return null;
}

function threadStartLine(thread: Poc3AgentReviewThread): number | null {
  if (thread.location.kind === 'diff' || thread.location.kind === 'node') {
    return thread.location.startLine;
  }
  return null;
}

function threadEndLine(thread: Poc3AgentReviewThread): number | null {
  if (thread.location.kind === 'diff' || thread.location.kind === 'node') {
    return thread.location.endLine;
  }
  return null;
}

export class ThreadRetentionService {
  constructor(
    private readonly graphStore: GraphReviewStore,
    private readonly agentReviewStore: Poc3AgentReviewStore,
  ) {}

  evaluate(reviewWorkspaceId: string, checkedRevisionId: string): Poc3ThreadTracking[] {
    const record = this.graphStore.getWorkspaceGraphRecord(
      reviewWorkspaceId,
      INITIAL_GRAPH_SCOPE_KEY,
    );
    const graph = record?.graph;
    if (
      !record?.activeRevision ||
      !graph ||
      record.activeRevision.revisionId !== checkedRevisionId
    ) {
      return [];
    }
    const nodesById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const nodesByStableSymbol = new Map(
      graph.nodes
        .filter((node) => node.stableSymbolId)
        .map((node) => [node.stableSymbolId as string, node]),
    );
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(checkedRevisionId);
    const deletedFiles = deletedFilePaths(sourceSnapshot?.changedFiles ?? []);
    const timestamp = nowIso();
    const sourceGraphCache = new Map<string, CodeGraphSnapshot | null>();
    const records = this.agentReviewStore
      .listAllThreadsForWorkspace(reviewWorkspaceId)
      .filter((thread) => thread.revisionId !== checkedRevisionId)
      .map((thread) => {
        if (!sourceGraphCache.has(thread.revisionId)) {
          sourceGraphCache.set(
            thread.revisionId,
            this.graphStore.getGraphSnapshot(thread.revisionId, INITIAL_GRAPH_SCOPE_KEY),
          );
        }
        const sourceRevision = this.graphStore.getRevision(thread.revisionId);
        return this.trackThread(
          thread,
          checkedRevisionId,
          sourceGraphCache.get(thread.revisionId) ?? null,
          sourceRevision?.status === 'orphaned',
          graph.nodes,
          nodesById,
          nodesByStableSymbol,
          deletedFiles,
          timestamp,
        );
      });
    this.agentReviewStore.saveThreadTracking(records);
    return records;
  }

  listOutdated(reviewWorkspaceId: string): Poc3OutdatedAgentThread[] {
    const activeRevision = this.graphStore.getActiveRevision(reviewWorkspaceId);
    const trackings = this.agentReviewStore.listOutdatedThreadTracking(
      reviewWorkspaceId,
      activeRevision?.revisionId ?? null,
    );
    const threads = new Map(
      this.agentReviewStore
        .listAllThreadsForWorkspace(reviewWorkspaceId)
        .map((thread) => [thread.localThreadId, thread]),
    );
    return trackings.flatMap((tracking) => {
      const thread = threads.get(tracking.localThreadId);
      const sourceRevision = this.graphStore.getRevision(tracking.sourceRevisionId);
      const checkedRevision = this.graphStore.getRevision(tracking.checkedRevisionId);
      if (!thread || !sourceRevision || !checkedRevision) {
        return [];
      }
      return [{ thread, tracking, sourceRevision, checkedRevision }];
    });
  }

  private trackThread(
    thread: Poc3AgentReviewThread,
    checkedRevisionId: string,
    sourceGraph: CodeGraphSnapshot | null,
    sourceRevisionOrphaned: boolean,
    latestNodes: CodeGraphNode[],
    nodesById: Map<string, CodeGraphNode>,
    nodesByStableSymbol: Map<string, CodeGraphNode>,
    deletedFiles: Set<string>,
    checkedAt: string,
  ): Poc3ThreadTracking {
    let status: Poc3ThreadTrackingStatus = 'outdated';
    let reason: Poc3ThreadOutdatedReason | null = 'nodeMissing';
    let trackedNodeId: string | null = null;

    const originalNode = thread.nodeId
      ? (sourceGraph?.nodes.find((node) => node.nodeId === thread.nodeId) ?? null)
      : null;

    if (thread.nodeId && nodesById.has(thread.nodeId)) {
      status = 'tracked';
      reason = null;
      trackedNodeId = thread.nodeId;
    } else {
      const stableNode = originalNode?.stableSymbolId
        ? nodesByStableSymbol.get(originalNode.stableSymbolId)
        : null;
      if (stableNode) {
        status = 'tracked';
        reason = null;
        trackedNodeId = stableNode.nodeId;
      } else {
        const symbolNode = originalNode
          ? findNodeBySymbolSignature(latestNodes, originalNode)
          : null;
        if (symbolNode) {
          status = 'tracked';
          reason = null;
          trackedNodeId = symbolNode.nodeId;
        } else {
          const filePath = threadFilePath(thread);
          if (sourceRevisionOrphaned && !sourceGraph) {
            status = 'unavailable';
            reason = 'orphanedRevision';
          } else {
            const rangeNode = findNodeContainingThreadRange(
              latestNodes,
              filePath,
              threadStartLine(thread),
              threadEndLine(thread),
            );
            if (rangeNode) {
              status = 'tracked';
              reason = null;
              trackedNodeId = rangeNode.nodeId;
            } else if (filePath && deletedFiles.has(filePath)) {
              reason = 'fileDeleted';
            } else if (filePath && threadStartLine(thread) !== null) {
              reason = 'rangeChanged';
            }
          }
        }
      }
    }

    return {
      localThreadId: thread.localThreadId,
      reviewWorkspaceId: thread.reviewWorkspaceId,
      sourceRevisionId: thread.revisionId,
      checkedRevisionId,
      status,
      reason,
      originalNodeId: thread.nodeId,
      trackedNodeId,
      originalLocation: thread.location,
      checkedAt,
    };
  }
}

function findNodeBySymbolSignature(
  nodes: CodeGraphNode[],
  originalNode: CodeGraphNode,
): CodeGraphNode | null {
  const candidates = nodes
    .filter((node) => node.filePath === originalNode.filePath)
    .filter((node) => node.kind === originalNode.kind)
    .filter((node) => node.label === originalNode.label)
    .sort((left, right) => lineDistance(left, originalNode) - lineDistance(right, originalNode));
  return candidates[0] ?? null;
}

function deletedFilePaths(files: ReviewChangedFile[]): Set<string> {
  const paths = files
    .filter((file) => file.status === 'removed')
    .flatMap((file) => [file.path, file.oldPath])
    .filter((filePath): filePath is string => Boolean(filePath));
  return new Set(paths);
}

function findNodeContainingThreadRange(
  nodes: CodeGraphNode[],
  filePath: string | null,
  startLine: number | null,
  endLine: number | null,
): CodeGraphNode | null {
  if (!filePath || startLine === null) {
    return null;
  }
  const targetEndLine = endLine ?? startLine;
  const candidates = nodes
    .filter((node) => node.filePath === filePath)
    .filter((node) => {
      if (node.declarationRange) {
        return (
          node.declarationRange.startLine <= startLine &&
          node.declarationRange.endLine >= targetEndLine
        );
      }
      return node.changedLineNumbers.includes(startLine);
    })
    .sort((left, right) => rangeSpan(left) - rangeSpan(right));
  return candidates[0] ?? null;
}

function rangeSpan(node: CodeGraphNode): number {
  if (!node.declarationRange) {
    return Number.MAX_SAFE_INTEGER;
  }
  return node.declarationRange.endLine - node.declarationRange.startLine;
}

function lineDistance(left: CodeGraphNode, right: CodeGraphNode): number {
  if (!left.declarationRange || !right.declarationRange) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.abs(left.declarationRange.startLine - right.declarationRange.startLine);
}
