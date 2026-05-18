import type { Edge, Node } from '@xyflow/react';
import type {
  GraphRenderEdge,
  GraphRenderNode,
  GraphRenderSnapshot,
} from '../../../../shared/poc3-domain/graph';
import { DEFAULT_GRAPH_RENDER_QUALITY, type GraphRenderQuality } from './graph-render-quality';

export interface Poc3CodeFlowNodeData extends Record<string, unknown> {
  kind: 'code';
  graphNode: GraphRenderNode;
  isFileHighlighted: boolean;
  renderQuality: GraphRenderQuality;
}

export interface Poc3FlowEdgeData extends Record<string, unknown> {
  graphEdge: GraphRenderEdge;
}

export type Poc3CodeFlowNode = Node<Poc3CodeFlowNodeData>;
export type Poc3FlowNode = Poc3CodeFlowNode;
export type Poc3FlowEdge = Edge<Poc3FlowEdgeData>;

export interface ToReactFlowElementsOptions {
  selectedNodeId?: string | null;
  highlightedFilePath?: string | null;
  includeLayers?: boolean;
  renderQuality?: GraphRenderQuality;
}

export function toReactFlowElements(
  snapshot: GraphRenderSnapshot,
  options: ToReactFlowElementsOptions = {},
): {
  nodes: Poc3FlowNode[];
  edges: Poc3FlowEdge[];
} {
  const selectedNodeId = options.selectedNodeId ?? null;
  const highlightedFilePath = options.highlightedFilePath ?? null;
  const includeLayers = options.includeLayers ?? true;
  const renderQuality = options.renderQuality ?? DEFAULT_GRAPH_RENDER_QUALITY;

  return {
    nodes: snapshot.nodes.map(
      (node): Poc3CodeFlowNode => ({
        id: node.nodeId,
        type: 'poc3GraphNode',
        position: node.position,
        selected: node.nodeId === selectedNodeId,
        zIndex: 10,
        width: node.size.width,
        height: node.size.height,
        data: {
          kind: 'code',
          graphNode: node,
          isFileHighlighted: highlightedFilePath != null && node.filePath === highlightedFilePath,
          renderQuality,
        },
      }),
    ),
    edges: snapshot.edges.map((edge) => ({
      id: edge.edgeId,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: 'smoothstep',
      label: edge.label ?? undefined,
      data: { graphEdge: edge },
      animated:
        !renderQuality.disableEdgeAnimation &&
        (edge.kind === 'calls' || edge.kind === 'constructs' || edge.kind === 'renders'),
      style:
        includeLayers && edge.layer?.isArchitectureViolation
          ? {
              stroke: '#ff8a4c',
              strokeWidth: 2.4,
            }
          : undefined,
    })),
  };
}
