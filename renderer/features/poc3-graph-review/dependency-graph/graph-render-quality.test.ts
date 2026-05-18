import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPH_RENDER_QUALITY,
  buildGraphRenderQualitySignature,
  resolveGraphRenderQuality,
  resolveGraphRenderQualityFromSummary,
} from './graph-render-quality';

describe('resolveGraphRenderQuality', () => {
  it('returns no degradation under all thresholds', () => {
    const q = resolveGraphRenderQuality({ renderedNodeCount: 50, renderedEdgeCount: 100 });
    expect(q).toEqual(DEFAULT_GRAPH_RENDER_QUALITY);
  });

  it('disables node blur and shadow once node count reaches 80', () => {
    const q = resolveGraphRenderQuality({ renderedNodeCount: 80, renderedEdgeCount: 100 });
    expect(q.disableNodeBlur).toBe(true);
    expect(q.disableNodeShadow).toBe(true);
    expect(q.disableEdgeAnimation).toBe(true);
    expect(q.disableNodeShader).toBe(false);
    expect(q.hideMiniMap).toBe(false);
  });

  it('disables shader once node count reaches 120 and recommends dense mode', () => {
    const q = resolveGraphRenderQuality({ renderedNodeCount: 120, renderedEdgeCount: 100 });
    expect(q.disableNodeShader).toBe(true);
    expect(q.dense).toBe(true);
  });

  it('disables edge animation once edge count reaches 250 even with sparse nodes', () => {
    const q = resolveGraphRenderQuality({ renderedNodeCount: 40, renderedEdgeCount: 250 });
    expect(q.disableEdgeAnimation).toBe(true);
    expect(q.disableNodeBlur).toBe(false);
  });

  it('hides MiniMap and layer lanes once node count reaches 150', () => {
    const q = resolveGraphRenderQuality({ renderedNodeCount: 150, renderedEdgeCount: 400 });
    expect(q.hideMiniMap).toBe(true);
    expect(q.hideLayerLanes).toBe(true);
  });

  it('honors denseRecommended even below the node threshold', () => {
    const q = resolveGraphRenderQuality({
      renderedNodeCount: 30,
      renderedEdgeCount: 30,
      denseRecommended: true,
    });
    expect(q.dense).toBe(true);
    expect(q.disableNodeBlur).toBe(false);
  });

  it('falls back to default quality when summary is null', () => {
    expect(resolveGraphRenderQualityFromSummary(null)).toEqual(DEFAULT_GRAPH_RENDER_QUALITY);
  });

  it('produces a distinct signature when quality changes', () => {
    const low = resolveGraphRenderQuality({ renderedNodeCount: 10, renderedEdgeCount: 10 });
    const high = resolveGraphRenderQuality({ renderedNodeCount: 200, renderedEdgeCount: 600 });
    expect(buildGraphRenderQualitySignature(low)).not.toBe(buildGraphRenderQualitySignature(high));
  });
});
