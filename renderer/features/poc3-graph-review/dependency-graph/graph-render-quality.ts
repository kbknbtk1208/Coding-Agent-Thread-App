import type { GraphViewSummary } from '../../../../shared/poc3-contracts/graph-review-ipc';

export interface GraphRenderQuality {
  dense: boolean;
  disableNodeBlur: boolean;
  disableNodeShadow: boolean;
  disableNodeShader: boolean;
  disableEdgeAnimation: boolean;
  hideMiniMap: boolean;
  hideLayerLanes: boolean;
}

export const DEFAULT_GRAPH_RENDER_QUALITY: GraphRenderQuality = {
  dense: false,
  disableNodeBlur: false,
  disableNodeShadow: false,
  disableNodeShader: false,
  disableEdgeAnimation: false,
  hideMiniMap: false,
  hideLayerLanes: false,
};

export const GRAPH_RENDER_QUALITY_THRESHOLDS = {
  nodeHeavyDecorations: 80,
  nodeShader: 120,
  edgeAnimation: 250,
  miniMap: 150,
  layerLanes: 150,
  denseRecommendation: 120,
} as const;

export interface ResolveGraphRenderQualityInput {
  renderedNodeCount: number;
  renderedEdgeCount: number;
  denseRecommended?: boolean;
}

export function resolveGraphRenderQuality({
  renderedNodeCount,
  renderedEdgeCount,
  denseRecommended,
}: ResolveGraphRenderQualityInput): GraphRenderQuality {
  const T = GRAPH_RENDER_QUALITY_THRESHOLDS;
  const disableNodeBlur = renderedNodeCount >= T.nodeHeavyDecorations;
  const disableNodeShadow = renderedNodeCount >= T.nodeHeavyDecorations;
  const disableNodeShader = renderedNodeCount >= T.nodeShader;
  const disableEdgeAnimation =
    renderedNodeCount >= T.nodeHeavyDecorations || renderedEdgeCount >= T.edgeAnimation;
  const hideMiniMap = renderedNodeCount >= T.miniMap;
  const hideLayerLanes = renderedNodeCount >= T.layerLanes;
  const dense = denseRecommended === true || renderedNodeCount >= T.denseRecommendation;
  return {
    dense,
    disableNodeBlur,
    disableNodeShadow,
    disableNodeShader,
    disableEdgeAnimation,
    hideMiniMap,
    hideLayerLanes,
  };
}

export function resolveGraphRenderQualityFromSummary(
  summary: Pick<
    GraphViewSummary,
    'renderedNodeCount' | 'renderedEdgeCount' | 'denseRecommended'
  > | null,
): GraphRenderQuality {
  if (!summary) {
    return DEFAULT_GRAPH_RENDER_QUALITY;
  }
  return resolveGraphRenderQuality({
    renderedNodeCount: summary.renderedNodeCount,
    renderedEdgeCount: summary.renderedEdgeCount,
    denseRecommended: summary.denseRecommended,
  });
}

export function buildGraphRenderQualitySignature(quality: GraphRenderQuality): string {
  return [
    quality.dense ? '1' : '0',
    quality.disableNodeBlur ? '1' : '0',
    quality.disableNodeShadow ? '1' : '0',
    quality.disableNodeShader ? '1' : '0',
    quality.disableEdgeAnimation ? '1' : '0',
    quality.hideMiniMap ? '1' : '0',
    quality.hideLayerLanes ? '1' : '0',
  ].join('');
}
