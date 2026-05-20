import type { CodeGraphNode, GraphRenderSnapshot } from '../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type { ReviewRemoteThread } from '../../../shared/poc3-domain/source-snapshot';

export interface GraphNodeLookupIndex<TNode extends CodeGraphNode = CodeGraphNode> {
  nodeById: Map<string, TNode>;
  nodesByFilePath: Map<string, TNode[]>;
  visibleNodeIds: Set<string>;
}

export interface RemoteThreadLookupIndex {
  currentDiffThreadsByFilePath: Map<string, ReviewRemoteThread[]>;
}

export interface AgentThreadLookupIndex {
  openThreadsByNodeId: Map<string, Poc3AgentReviewThread[]>;
  openDiffThreadsByFilePath: Map<string, Poc3AgentReviewThread[]>;
}

export function buildGraphNodeLookupIndex<TNode extends CodeGraphNode>(
  nodes: readonly TNode[],
): GraphNodeLookupIndex<TNode> {
  const nodeById = new Map<string, TNode>();
  const nodesByFilePath = new Map<string, TNode[]>();
  const visibleNodeIds = new Set<string>();
  for (const node of nodes) {
    nodeById.set(node.nodeId, node);
    visibleNodeIds.add(node.nodeId);
    if (node.filePath) {
      const bucket = nodesByFilePath.get(node.filePath);
      if (bucket) {
        bucket.push(node);
      } else {
        nodesByFilePath.set(node.filePath, [node]);
      }
    }
  }
  return { nodeById, nodesByFilePath, visibleNodeIds };
}

export function buildRemoteThreadLookupIndex(
  remoteThreads: readonly ReviewRemoteThread[],
): RemoteThreadLookupIndex {
  const currentDiffThreadsByFilePath = new Map<string, ReviewRemoteThread[]>();
  for (const thread of remoteThreads) {
    if (thread.isResolved === true) continue;
    if (thread.location.kind !== 'diff') continue;
    if (thread.anchorStatus !== 'current' && thread.anchorStatus !== 'outdated') continue;
    const filePath = thread.location.filePath;
    if (!filePath) continue;
    const bucket = currentDiffThreadsByFilePath.get(filePath);
    if (bucket) {
      bucket.push(thread);
    } else {
      currentDiffThreadsByFilePath.set(filePath, [thread]);
    }
  }
  return { currentDiffThreadsByFilePath };
}

export function buildAgentThreadLookupIndex(
  threads: readonly Poc3AgentReviewThread[],
): AgentThreadLookupIndex {
  const openThreadsByNodeId = new Map<string, Poc3AgentReviewThread[]>();
  const openDiffThreadsByFilePath = new Map<string, Poc3AgentReviewThread[]>();
  for (const thread of threads) {
    if (thread.status !== 'open') continue;
    if (thread.nodeId) {
      const bucket = openThreadsByNodeId.get(thread.nodeId);
      if (bucket) {
        bucket.push(thread);
      } else {
        openThreadsByNodeId.set(thread.nodeId, [thread]);
      }
    }
    if (thread.location.kind === 'diff' && thread.location.filePath) {
      const bucket = openDiffThreadsByFilePath.get(thread.location.filePath);
      if (bucket) {
        bucket.push(thread);
      } else {
        openDiffThreadsByFilePath.set(thread.location.filePath, [thread]);
      }
    }
  }
  return { openThreadsByNodeId, openDiffThreadsByFilePath };
}

export function findNodesByFilePath<TNode extends CodeGraphNode>(
  index: GraphNodeLookupIndex<TNode>,
  filePath: string | null | undefined,
): readonly TNode[] {
  if (!filePath) return [];
  return index.nodesByFilePath.get(filePath) ?? [];
}

export function isLineWithinNodeRange(node: CodeGraphNode, line: number | null): boolean {
  if (node.kind === 'module' || node.kind === 'file-scope') {
    return true;
  }
  const range = node.declarationRange;
  if (!range) {
    return true;
  }
  if (line === null) {
    return false;
  }
  return line >= range.startLine && line <= range.endLine;
}

export type RenderNodeLookupIndex = GraphNodeLookupIndex<GraphRenderSnapshot['nodes'][number]>;
