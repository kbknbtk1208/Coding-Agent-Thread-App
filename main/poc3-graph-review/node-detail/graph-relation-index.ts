import type {
  GraphRenderEdge,
  GraphRenderNode,
  GraphRenderSnapshot,
} from '../../../shared/poc3-domain/graph';

export interface GraphRelationIndex {
  nodeById: Map<string, GraphRenderNode>;
  incomingByNodeId: Map<string, GraphRenderEdge[]>;
  outgoingByNodeId: Map<string, GraphRenderEdge[]>;
}

export function buildGraphRelationIndex(snapshot: GraphRenderSnapshot): GraphRelationIndex {
  const nodeById = new Map<string, GraphRenderNode>();
  const incomingByNodeId = new Map<string, GraphRenderEdge[]>();
  const outgoingByNodeId = new Map<string, GraphRenderEdge[]>();

  for (const node of snapshot.nodes) {
    nodeById.set(node.nodeId, node);
  }
  for (const edge of snapshot.edges) {
    const incoming = incomingByNodeId.get(edge.targetNodeId) ?? [];
    incoming.push(edge);
    incomingByNodeId.set(edge.targetNodeId, incoming);

    const outgoing = outgoingByNodeId.get(edge.sourceNodeId) ?? [];
    outgoing.push(edge);
    outgoingByNodeId.set(edge.sourceNodeId, outgoing);
  }

  return { nodeById, incomingByNodeId, outgoingByNodeId };
}
