import { randomUUID } from 'crypto';
import ELK from 'elkjs/lib/elk.bundled.js';
import type {
  CodeGraphSnapshot,
  GraphDiagnostic,
  GraphNodeLayout,
  LayoutSnapshot,
} from '../../../shared/poc3-domain/graph';

const NODE_SIZES: Record<
  CodeGraphSnapshot['nodes'][number]['kind'],
  { width: number; height: number }
> = {
  module: { width: 220, height: 64 },
  function: { width: 180, height: 52 },
  method: { width: 180, height: 52 },
  component: { width: 180, height: 52 },
  hook: { width: 180, height: 52 },
  external: { width: 160, height: 44 },
};

function nowIso(): string {
  return new Date().toISOString();
}

export function fallbackGridLayout(graph: CodeGraphSnapshot): Record<string, GraphNodeLayout> {
  const positions: Record<string, GraphNodeLayout> = {};
  const columns = Math.max(1, Math.ceil(Math.sqrt(graph.nodes.length)));
  graph.nodes.forEach((node, index) => {
    const size = NODE_SIZES[node.kind];
    positions[node.nodeId] = {
      x: (index % columns) * 240,
      y: Math.floor(index / columns) * 120,
      width: size.width,
      height: size.height,
    };
  });
  return positions;
}

export async function layoutGraph(graph: CodeGraphSnapshot): Promise<{
  graph: CodeGraphSnapshot;
  layout: LayoutSnapshot;
  diagnostics: GraphDiagnostic[];
}> {
  const diagnostics: GraphDiagnostic[] = [];
  let positions: Record<string, GraphNodeLayout>;
  let engine = 'elk-layered';
  let status = graph.status;

  try {
    const elk = new ELK();
    const result = await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.spacing.nodeNode': '36',
      },
      children: graph.nodes.map((node) => {
        const size = NODE_SIZES[node.kind];
        return {
          id: node.nodeId,
          width: size.width,
          height: size.height,
        };
      }),
      edges: graph.edges.map((edge) => ({
        id: edge.edgeId,
        sources: [edge.sourceNodeId],
        targets: [edge.targetNodeId],
      })),
    });
    positions = {};
    for (const child of result.children ?? []) {
      const node = graph.nodes.find((candidate) => candidate.nodeId === child.id);
      const size = node
        ? NODE_SIZES[node.kind]
        : { width: child.width ?? 180, height: child.height ?? 52 };
      positions[child.id] = {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? size.width,
        height: child.height ?? size.height,
      };
    }
  } catch (err) {
    engine = 'fallback-grid';
    status = 'partial';
    positions = fallbackGridLayout(graph);
    diagnostics.push({
      code: 'LAYOUT_FAILED_FALLBACK_GRID',
      message: err instanceof Error ? err.message : 'Graph layout に失敗しました。',
      severity: 'warning',
    });
  }

  const timestamp = nowIso();
  return {
    graph: {
      ...graph,
      status,
      diagnostics: [...graph.diagnostics, ...diagnostics],
      updatedAt: timestamp,
    },
    layout: {
      layoutSnapshotId: randomUUID(),
      graphSnapshotId: graph.graphSnapshotId,
      engine,
      positions,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    diagnostics,
  };
}
