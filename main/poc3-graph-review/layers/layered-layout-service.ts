import { randomUUID } from 'crypto';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { CodeGraphSnapshot, GraphNodeLayout } from '../../../shared/poc3-domain/graph';
import type {
  GraphLayerDiagnostic,
  GraphLayerGroupRender,
  GraphLayerLaneRender,
  GraphNodeLayerClassification,
  RepositoryLayerProfile,
} from '../../../shared/poc3-domain/layer-profile';

const NODE_SIZES: Record<
  CodeGraphSnapshot['nodes'][number]['kind'],
  { width: number; height: number }
> = {
  module: { width: 320, height: 72 },
  function: { width: 260, height: 60 },
  method: { width: 260, height: 60 },
  component: { width: 260, height: 60 },
  hook: { width: 260, height: 60 },
  'file-scope': { width: 280, height: 60 },
  external: { width: 220, height: 52 },
  'external-symbol': { width: 220, height: 52 },
};

const LANE_PADDING_X = 64;
const LANE_PADDING_Y = 72;
const LANE_GAP = 120;
const LANE_MIN_WIDTH = 360;
const LANE_MIN_HEIGHT = 240;
const FALLBACK_GRID_COLUMNS = 3;
const FALLBACK_GRID_HORIZONTAL_GAP = 360;
const FALLBACK_GRID_VERTICAL_GAP = 160;

export interface LayeredLayoutServiceInput {
  graph: CodeGraphSnapshot;
  profile: RepositoryLayerProfile;
  nodeClassifications: Record<string, GraphNodeLayerClassification>;
}

export interface LayeredLayoutServiceResult {
  positions: Record<string, GraphNodeLayout>;
  lanes: GraphLayerLaneRender[];
  groups: GraphLayerGroupRender[];
  diagnostics: GraphLayerDiagnostic[];
}

interface LanePlan {
  layerPath: string;
  displayName: string;
  order: number;
  parentLayerPath: string | null;
  unclassified: boolean;
  nodeIds: string[];
}

function displayNameForLayerPath(layerPath: string): string {
  return layerPath.split('/').filter(Boolean).at(-1) ?? layerPath;
}

function parentLayerPath(layerPath: string): string | null {
  const parts = layerPath.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return null;
  }
  return parts.slice(0, -1).join('/');
}

function enabledRuleLayerOrder(profile: RepositoryLayerProfile): Map<string, number> {
  const orderByLayer = new Map<string, number>();
  for (const rule of profile.rules) {
    if (!rule.enabled) {
      continue;
    }
    const current = orderByLayer.get(rule.layerPath);
    if (current === undefined || rule.order < current) {
      orderByLayer.set(rule.layerPath, rule.order);
    }
  }
  return orderByLayer;
}

function leafLayerPaths(orderByLayer: Map<string, number>): Set<string> {
  const paths = Array.from(orderByLayer.keys());
  return new Set(
    paths.filter((candidate) => !paths.some((path) => path.startsWith(`${candidate}/`))),
  );
}

function fallbackLaneLayout(nodes: CodeGraphSnapshot['nodes']): Record<string, GraphNodeLayout> {
  const positions: Record<string, GraphNodeLayout> = {};
  nodes.forEach((node, index) => {
    const size = NODE_SIZES[node.kind];
    positions[node.nodeId] = {
      x: (index % FALLBACK_GRID_COLUMNS) * FALLBACK_GRID_HORIZONTAL_GAP,
      y: Math.floor(index / FALLBACK_GRID_COLUMNS) * FALLBACK_GRID_VERTICAL_GAP,
      width: size.width,
      height: size.height,
    };
  });
  return positions;
}

function fallbackAreaLayout(input: {
  nodes: CodeGraphSnapshot['nodes'];
  originX: number;
  originY: number;
}): Record<string, GraphNodeLayout> {
  const positions: Record<string, GraphNodeLayout> = {};
  input.nodes.forEach((node, index) => {
    const size = NODE_SIZES[node.kind];
    positions[node.nodeId] = {
      x: input.originX + (index % FALLBACK_GRID_COLUMNS) * FALLBACK_GRID_HORIZONTAL_GAP,
      y: input.originY + Math.floor(index / FALLBACK_GRID_COLUMNS) * FALLBACK_GRID_VERTICAL_GAP,
      width: size.width,
      height: size.height,
    };
  });
  return positions;
}

function boundsForPositions(positions: Record<string, GraphNodeLayout>): {
  width: number;
  height: number;
} {
  const layouts = Object.values(positions);
  if (layouts.length === 0) {
    return { width: LANE_MIN_WIDTH, height: LANE_MIN_HEIGHT };
  }
  const maxX = Math.max(...layouts.map((layout) => layout.x + layout.width));
  const maxY = Math.max(...layouts.map((layout) => layout.y + layout.height));
  return {
    width: Math.max(LANE_MIN_WIDTH, maxX + LANE_PADDING_X * 2),
    height: Math.max(LANE_MIN_HEIGHT, maxY + LANE_PADDING_Y * 2),
  };
}

async function layoutLane(input: {
  graph: CodeGraphSnapshot;
  nodeIds: Set<string>;
}): Promise<Record<string, GraphNodeLayout>> {
  const nodes = input.graph.nodes.filter((node) => input.nodeIds.has(node.nodeId));
  if (nodes.length === 0) {
    return {};
  }
  const elk = new ELK();
  const result = await elk.layout({
    id: 'lane',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '72',
    },
    children: nodes.map((node) => {
      const size = NODE_SIZES[node.kind];
      return {
        id: node.nodeId,
        width: size.width,
        height: size.height,
      };
    }),
    edges: input.graph.edges
      .filter(
        (edge) => input.nodeIds.has(edge.sourceNodeId) && input.nodeIds.has(edge.targetNodeId),
      )
      .map((edge) => ({
        id: edge.edgeId,
        sources: [edge.sourceNodeId],
        targets: [edge.targetNodeId],
      })),
  });

  const positions: Record<string, GraphNodeLayout> = {};
  for (const child of result.children ?? []) {
    const node = nodes.find((candidate) => candidate.nodeId === child.id);
    const size = node ? NODE_SIZES[node.kind] : { width: 260, height: 60 };
    positions[child.id] = {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? size.width,
      height: child.height ?? size.height,
    };
  }
  return positions;
}

function buildLanePlans(input: LayeredLayoutServiceInput): LanePlan[] {
  const orderByLayer = enabledRuleLayerOrder(input.profile);
  const leafPaths = leafLayerPaths(orderByLayer);
  const nodeIdsByLayerPath = new Map<string, string[]>();
  const unclassifiedNodeIds: string[] = [];

  for (const node of input.graph.nodes) {
    const classification = input.nodeClassifications[node.nodeId];
    if (classification?.status === 'classified' && classification.layerPath) {
      const nodeIds = nodeIdsByLayerPath.get(classification.layerPath) ?? [];
      nodeIds.push(node.nodeId);
      nodeIdsByLayerPath.set(classification.layerPath, nodeIds);
      continue;
    }
    if (classification?.status === 'unclassified') {
      unclassifiedNodeIds.push(node.nodeId);
    }
  }

  const knownLayerPaths = new Set<string>([
    ...Array.from(leafPaths),
    ...Array.from(nodeIdsByLayerPath.keys()),
  ]);
  const plans: LanePlan[] = Array.from(knownLayerPaths)
    .map((layerPath) => ({
      layerPath,
      displayName:
        input.profile.rules.find((rule) => rule.enabled && rule.layerPath === layerPath)
          ?.displayName || displayNameForLayerPath(layerPath),
      order: orderByLayer.get(layerPath) ?? Number.MAX_SAFE_INTEGER - 1,
      parentLayerPath: parentLayerPath(layerPath),
      unclassified: false,
      nodeIds: nodeIdsByLayerPath.get(layerPath) ?? [],
    }))
    .sort((a, b) => a.order - b.order || a.layerPath.localeCompare(b.layerPath));

  if (unclassifiedNodeIds.length > 0) {
    plans.push({
      layerPath: 'unclassified',
      displayName: 'unclassified',
      order: Number.MAX_SAFE_INTEGER,
      parentLayerPath: null,
      unclassified: true,
      nodeIds: unclassifiedNodeIds,
    });
  }
  return plans;
}

function buildGroups(lanes: GraphLayerLaneRender[]): GraphLayerGroupRender[] {
  const groupByPath = new Map<string, GraphLayerLaneRender[]>();
  for (const lane of lanes) {
    if (!lane.parentLayerPath) {
      continue;
    }
    const childLanes = groupByPath.get(lane.parentLayerPath) ?? [];
    childLanes.push(lane);
    groupByPath.set(lane.parentLayerPath, childLanes);
  }

  return Array.from(groupByPath.entries()).map(([layerPath, childLanes]) => {
    const minX = Math.min(...childLanes.map((lane) => lane.bounds.x));
    const minY = Math.min(...childLanes.map((lane) => lane.bounds.y));
    const maxX = Math.max(...childLanes.map((lane) => lane.bounds.x + lane.bounds.width));
    const maxY = Math.max(...childLanes.map((lane) => lane.bounds.y + lane.bounds.height));
    return {
      groupId: `layer-group:${layerPath}`,
      layerPath,
      displayName: displayNameForLayerPath(layerPath),
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      childLaneIds: childLanes.map((lane) => lane.laneId),
    };
  });
}

export class LayeredLayoutService {
  async layout(input: LayeredLayoutServiceInput): Promise<LayeredLayoutServiceResult> {
    const positions: Record<string, GraphNodeLayout> = {};
    const diagnostics: GraphLayerDiagnostic[] = [];
    const lanes: GraphLayerLaneRender[] = [];
    let nextLaneX = 0;

    for (const plan of buildLanePlans(input)) {
      const nodeIds = new Set(plan.nodeIds);
      const nodes = input.graph.nodes.filter((node) => nodeIds.has(node.nodeId));
      let lanePositions: Record<string, GraphNodeLayout>;
      try {
        lanePositions = await layoutLane({ graph: input.graph, nodeIds });
      } catch (err) {
        lanePositions = fallbackLaneLayout(nodes);
        diagnostics.push({
          code: 'LAYER_LAYOUT_FAILED_FALLBACK_GRID',
          severity: 'warning',
          message: err instanceof Error ? err.message : 'Layer lane layout failed.',
          layerRuleIds: plan.unclassified ? undefined : [plan.layerPath],
        });
      }

      const laneBounds = boundsForPositions(lanePositions);
      const lane: GraphLayerLaneRender = {
        laneId: plan.unclassified ? 'layer-lane:unclassified' : `layer-lane:${plan.layerPath}`,
        layerPath: plan.layerPath,
        displayName: plan.displayName,
        order: plan.order,
        parentLayerPath: plan.parentLayerPath,
        bounds: {
          x: nextLaneX,
          y: 0,
          width: laneBounds.width,
          height: laneBounds.height,
        },
        nodeIds: plan.nodeIds,
        unclassified: plan.unclassified,
      };
      lanes.push(lane);

      for (const [nodeId, layout] of Object.entries(lanePositions)) {
        positions[nodeId] = {
          x: lane.bounds.x + LANE_PADDING_X + layout.x,
          y: lane.bounds.y + LANE_PADDING_Y + layout.y,
          width: layout.width,
          height: layout.height,
        };
      }
      nextLaneX += lane.bounds.width + LANE_GAP;
    }

    const laneOutsideNodes = input.graph.nodes.filter((node) => !positions[node.nodeId]);
    const laneOutsidePositions = fallbackAreaLayout({
      nodes: laneOutsideNodes,
      originX: nextLaneX,
      originY: 0,
    });
    for (const [nodeId, layout] of Object.entries(laneOutsidePositions)) {
      positions[nodeId] = layout;
    }

    return {
      positions,
      lanes,
      groups: buildGroups(lanes),
      diagnostics,
    };
  }
}

export function createGraphLayerApplicationId(): string {
  return randomUUID();
}
