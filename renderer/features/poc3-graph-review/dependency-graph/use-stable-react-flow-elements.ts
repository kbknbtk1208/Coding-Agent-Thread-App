'use client';

import { useMemo, useRef } from 'react';
import type {
  GraphRenderEdge,
  GraphRenderNode,
  GraphRenderSnapshot,
} from '../../../../shared/poc3-domain/graph';
import {
  toReactFlowElements,
  type Poc3FlowEdge,
  type Poc3FlowNode,
} from './to-react-flow-elements';

export interface Poc3GraphViewState {
  selectedNodeId: string | null;
  highlightedFilePath: string | null;
}

interface CachedFlowNode {
  signature: string;
  selected: boolean;
  highlighted: boolean;
  flowNode: Poc3FlowNode;
}

interface CachedFlowEdge {
  signature: string;
  flowEdge: Poc3FlowEdge;
}

export interface StableFlowElementCache {
  nodesById: Map<string, CachedFlowNode>;
  edgesById: Map<string, CachedFlowEdge>;
}

export function createStableFlowElementCache(): StableFlowElementCache {
  return {
    nodesById: new Map(),
    edgesById: new Map(),
  };
}

export function reconcileReactFlowElements(
  graph: GraphRenderSnapshot,
  viewState: Poc3GraphViewState,
  previous: StableFlowElementCache,
): {
  nodes: Poc3FlowNode[];
  edges: Poc3FlowEdge[];
  cache: StableFlowElementCache;
} {
  const nextRaw = toReactFlowElements(graph, viewState);
  const nextCache = createStableFlowElementCache();

  const nodes = nextRaw.nodes.map((flowNode) => {
    const graphNode = flowNode.data.graphNode;
    const signature = buildNodeSignature(graphNode);
    const selected = flowNode.selected === true;
    const highlighted = flowNode.data.isFileHighlighted;
    const cached = previous.nodesById.get(flowNode.id);

    if (
      cached &&
      cached.signature === signature &&
      cached.selected === selected &&
      cached.highlighted === highlighted
    ) {
      nextCache.nodesById.set(flowNode.id, cached);
      return cached.flowNode;
    }

    const nextCached = { signature, selected, highlighted, flowNode };
    nextCache.nodesById.set(flowNode.id, nextCached);
    return flowNode;
  });

  const edges = nextRaw.edges.map((flowEdge) => {
    const graphEdge = flowEdge.data?.graphEdge;
    if (!graphEdge) {
      return flowEdge;
    }
    const signature = buildEdgeSignature(graphEdge);
    const cached = previous.edgesById.get(flowEdge.id);

    if (cached && cached.signature === signature) {
      nextCache.edgesById.set(flowEdge.id, cached);
      return cached.flowEdge;
    }

    const nextCached = { signature, flowEdge };
    nextCache.edgesById.set(flowEdge.id, nextCached);
    return flowEdge;
  });

  return { nodes, edges, cache: nextCache };
}

export function useStableReactFlowElements(
  graph: GraphRenderSnapshot,
  viewState: Poc3GraphViewState,
): {
  nodes: Poc3FlowNode[];
  edges: Poc3FlowEdge[];
} {
  const cacheRef = useRef<StableFlowElementCache>(createStableFlowElementCache());

  return useMemo(() => {
    const result = reconcileReactFlowElements(graph, viewState, cacheRef.current);
    cacheRef.current = result.cache;
    return { nodes: result.nodes, edges: result.edges };
  }, [graph, viewState]);
}

function buildNodeSignature(node: GraphRenderNode): string {
  return [
    node.nodeId,
    node.kind,
    node.label,
    node.filePath ?? '',
    node.diffStatus,
    node.isDiffNode ? '1' : '0',
    node.badges.changedLines,
    node.badges.findingCount,
    node.badges.remoteThreadCount,
    node.position.x,
    node.position.y,
    node.size.width,
    node.size.height,
  ].join('\0');
}

function buildEdgeSignature(edge: GraphRenderEdge): string {
  return [edge.edgeId, edge.sourceNodeId, edge.targetNodeId, edge.kind, edge.label ?? ''].join(
    '\0',
  );
}
