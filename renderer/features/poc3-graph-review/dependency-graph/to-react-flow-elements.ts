import type { Edge, Node } from '@xyflow/react';
import type {
  GraphRenderEdge,
  GraphRenderNode,
  GraphRenderSnapshot,
} from '../../../../shared/poc3-domain/graph';

export interface Poc3FlowNodeData extends Record<string, unknown> {
  graphNode: GraphRenderNode;
}

export interface Poc3FlowEdgeData extends Record<string, unknown> {
  graphEdge: GraphRenderEdge;
}

export type Poc3FlowNode = Node<Poc3FlowNodeData>;
export type Poc3FlowEdge = Edge<Poc3FlowEdgeData>;

export function toReactFlowElements(snapshot: GraphRenderSnapshot): {
  nodes: Poc3FlowNode[];
  edges: Poc3FlowEdge[];
} {
  return {
    nodes: snapshot.nodes.map((node) => ({
      id: node.nodeId,
      type: 'poc3GraphNode',
      position: node.position,
      data: { graphNode: node },
      style: {
        width: node.size.width,
        height: node.size.height,
      },
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.edgeId,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: 'smoothstep',
      label: edge.label ?? undefined,
      data: { graphEdge: edge },
      animated: edge.kind === 'calls' || edge.kind === 'constructs' || edge.kind === 'renders',
    })),
  };
}
