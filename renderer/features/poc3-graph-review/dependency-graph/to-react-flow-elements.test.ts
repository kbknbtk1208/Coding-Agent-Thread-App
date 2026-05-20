import { describe, expect, it } from 'vitest';
import { createGraphSnapshot, createLayeredGraphSnapshot } from './graph-test-fixtures';
import { resolveGraphRenderQuality } from './graph-render-quality';
import {
  createLayerLaneOverlays,
  isLaneHeaderVisible,
  shouldRenderLayerLanesOverlay,
  shouldUseCompactLayerLane,
} from './layer-lanes-overlay';
import { toReactFlowElements } from './to-react-flow-elements';

describe('toReactFlowElements', () => {
  it('applies selected and highlighted view state during conversion', () => {
    const elements = toReactFlowElements(createGraphSnapshot(), {
      selectedNodeId: 'node-2',
      highlightedFilePath: 'src/target.ts',
    });

    expect(elements.nodes.map((node) => [node.id, node.selected === true])).toEqual([
      ['node-1', false],
      ['node-2', true],
    ]);
    expect(elements.nodes.map((node) => [node.id, node.data.isFileHighlighted])).toEqual([
      ['node-1', false],
      ['node-2', true],
    ]);
  });

  it('omits layer edge styling when includeLayers is false', () => {
    const elements = toReactFlowElements(createLayeredGraphSnapshot(), {
      includeLayers: false,
    });

    expect(elements.nodes.every((node) => node.data.kind === 'code')).toBe(true);
    expect(elements.edges[0].label).toBe('calls');
    expect(elements.edges[0].style).toBeUndefined();
  });

  it('does not include lane background nodes in React Flow nodes', () => {
    const elements = toReactFlowElements(createLayeredGraphSnapshot());

    expect(elements.nodes.every((node) => node.data.kind === 'code')).toBe(true);
    expect(elements.nodes.some((node) => node.id.startsWith('layer-lane:'))).toBe(false);
    expect(elements.nodes.some((node) => node.type === 'poc3LayerLane')).toBe(false);
  });

  it('can suppress lane overlay while the viewport is interacting', () => {
    const lanes = createLayeredGraphSnapshot().layers?.lanes ?? [];

    expect(shouldRenderLayerLanesOverlay(lanes, false)).toBe(true);
    expect(shouldRenderLayerLanesOverlay(lanes, true)).toBe(false);
    expect(shouldRenderLayerLanesOverlay([], false)).toBe(false);
  });

  it('uses compact lane overlay for huge screen-space lanes', () => {
    const lanes = createLayeredGraphSnapshot().layers?.lanes ?? [];
    const largeLane = {
      ...lanes[0],
      bounds: { x: 0, y: 0, width: 4000, height: 1200 },
    };
    const smallLane = {
      ...lanes[0],
      bounds: { x: 0, y: 0, width: 360, height: 240 },
    };

    expect(shouldUseCompactLayerLane(largeLane, 0.8)).toBe(true);
    expect(shouldUseCompactLayerLane(smallLane, 0.8)).toBe(false);
  });

  it('creates screen-fixed lane headers and compact outlines from the current viewport', () => {
    const lanes = createLayeredGraphSnapshot().layers?.lanes ?? [];
    const canvasSize = { width: 640, height: 420 };
    const overlays = createLayerLaneOverlays(
      [
        {
          ...lanes[0],
          bounds: { x: -400, y: -120, width: 3000, height: 1200 },
        },
      ],
      { x: 120, y: 80, zoom: 0.5 },
      canvasSize,
    );

    expect(overlays).toHaveLength(1);
    expect(overlays[0].header.left).toBeGreaterThanOrEqual(10);
    expect(overlays[0].header.top).toBeGreaterThanOrEqual(10);
    expect(overlays[0].header.left + overlays[0].header.width).toBeLessThanOrEqual(630);
    expect(overlays[0].outline.mode).toBe('compact');
    expect(overlays[0].outline.clipped).toEqual({
      left: true,
      top: false,
      right: true,
      bottom: true,
    });
    expectBoundsInsideCanvas(overlays[0].outline.bounds, canvasSize);
  });

  it('keeps standard and compact lane outline attributes distinct', () => {
    const lanes = createLayeredGraphSnapshot().layers?.lanes ?? [];
    const canvasSize = { width: 640, height: 420 };
    const overlays = createLayerLaneOverlays(
      [
        {
          ...lanes[0],
          bounds: { x: 40, y: 48, width: 360, height: 240 },
        },
        {
          ...lanes[1],
          bounds: { x: -800, y: -600, width: 3200, height: 1800 },
        },
      ],
      { x: 0, y: 0, zoom: 1 },
      canvasSize,
    );

    expect(overlays).toHaveLength(2);
    expect(overlays[0].outline.mode).toBe('standard');
    expect(overlays[0].outline.clipped).toEqual({
      left: false,
      top: false,
      right: false,
      bottom: false,
    });
    expect(overlays[1].outline.mode).toBe('compact');
    expect(overlays[1].outline.clipped).toEqual({
      left: true,
      top: true,
      right: true,
      bottom: true,
    });
    expectBoundsInsideCanvas(overlays[0].outline.bounds, canvasSize);
    expectBoundsInsideCanvas(overlays[1].outline.bounds, canvasSize);
  });

  it('omits lane overlays that are barely visible vertically', () => {
    const lanes = createLayeredGraphSnapshot().layers?.lanes ?? [];
    const overlays = createLayerLaneOverlays(
      [
        {
          ...lanes[0],
          bounds: { x: 40, y: -180, width: 360, height: 200 },
        },
      ],
      { x: 0, y: 0, zoom: 1 },
      { width: 640, height: 420 },
    );

    expect(overlays).toHaveLength(0);
  });

  it('marks architecture violations without changing labels', () => {
    const elements = toReactFlowElements(createLayeredGraphSnapshot());

    expect(elements.edges[0].label).toBe('calls');
    expect(elements.edges[0].style).toMatchObject({
      stroke: '#ff8a4c',
      strokeWidth: 2.4,
    });
  });

  it('keeps viewport interaction state out of node data', () => {
    const elements = toReactFlowElements(createLayeredGraphSnapshot());

    expect(elements.nodes.every((node) => !('isViewportInteracting' in node.data))).toBe(true);
  });

  it('attaches render quality to node data and disables edge animation when requested', () => {
    const renderQuality = resolveGraphRenderQuality({
      renderedNodeCount: 200,
      renderedEdgeCount: 600,
    });
    const elements = toReactFlowElements(createGraphSnapshot(), { renderQuality });

    expect(elements.nodes[0].data.renderQuality).toBe(renderQuality);
    expect(elements.edges[0].animated).toBe(false);
  });

  it('keeps edges animated under default quality', () => {
    const elements = toReactFlowElements(createGraphSnapshot());

    expect(elements.edges[0].animated).toBe(true);
  });

  it('hides lane overlay entirely when lane count exceeds the threshold', () => {
    const tooMany = Array.from({ length: 151 }, (_, i) => ({
      laneId: `lane-${i}`,
      layerPath: `layer-${i}`,
      displayName: `layer-${i}`,
      order: i,
      parentLayerPath: null,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeIds: [],
      unclassified: false,
    }));
    expect(shouldRenderLayerLanesOverlay(tooMany, false)).toBe(false);
  });

  it('hides lane headers when lane count is large or zoom is low or dense mode is on', () => {
    expect(isLaneHeaderVisible(10, 1, false)).toBe(true);
    expect(isLaneHeaderVisible(81, 1, false)).toBe(false);
    expect(isLaneHeaderVisible(10, 0.34, false)).toBe(false);
    expect(isLaneHeaderVisible(10, 1, true)).toBe(false);
  });
});

function expectBoundsInsideCanvas(
  bounds: { left: number; top: number; width: number; height: number },
  canvasSize: { width: number; height: number },
) {
  expect(bounds.left).toBeGreaterThanOrEqual(10);
  expect(bounds.top).toBeGreaterThanOrEqual(10);
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.left + bounds.width).toBeLessThanOrEqual(canvasSize.width - 10);
  expect(bounds.top + bounds.height).toBeLessThanOrEqual(canvasSize.height - 10);
}
