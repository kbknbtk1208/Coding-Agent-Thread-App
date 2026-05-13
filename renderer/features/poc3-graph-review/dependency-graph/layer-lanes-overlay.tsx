'use client';

import { useViewport } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GraphLayerLaneRender } from '../../../../shared/poc3-domain/layer-profile';

const COMPACT_LANE_SCREEN_WIDTH = 1200;
const COMPACT_LANE_SCREEN_HEIGHT = 720;
const COMPACT_LANE_SCREEN_AREA = 560_000;
const CANVAS_PADDING = 10;
const HEADER_HEIGHT = 34;
const HEADER_TOP_OFFSET = 8;
const MIN_HEADER_WIDTH = 132;
const MAX_HEADER_WIDTH = 320;
const MIN_VISIBLE_WIDTH = 72;
const MIN_VISIBLE_HEIGHT = HEADER_HEIGHT + HEADER_TOP_OFFSET * 2;
const MIN_OUTLINE_SIZE = 2;

interface LayerLanesOverlayProps {
  lanes: readonly GraphLayerLaneRender[];
  hidden?: boolean;
}

export const LayerLanesOverlay = memo(function LayerLanesOverlay({
  lanes,
  hidden = false,
}: LayerLanesOverlayProps) {
  const viewport = useViewport();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) {
      return;
    }

    const updateCanvasSize = () => {
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateCanvasSize();

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hidden, lanes.length]);

  if (!shouldRenderLayerLanesOverlay(lanes, hidden)) {
    return null;
  }

  const overlays = createLayerLaneOverlays(lanes, viewport, canvasSize);

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      data-poc3-layer-lanes-overlay="screen"
      data-poc3-layer-lanes-count={lanes.length}
      data-poc3-layer-lanes-visible-count={overlays.length}
    >
      {overlays.map((overlay) => (
        <LayerLaneOverlay key={overlay.laneId} overlay={overlay} />
      ))}
    </div>
  );
});

export function shouldRenderLayerLanesOverlay(
  lanes: readonly GraphLayerLaneRender[],
  hidden: boolean,
) {
  return !hidden && lanes.length > 0;
}

export function shouldUseCompactLayerLane(lane: GraphLayerLaneRender, zoom: number) {
  const screenWidth = lane.bounds.width * zoom;
  const screenHeight = lane.bounds.height * zoom;
  return (
    screenWidth >= COMPACT_LANE_SCREEN_WIDTH ||
    screenHeight >= COMPACT_LANE_SCREEN_HEIGHT ||
    screenWidth * screenHeight >= COMPACT_LANE_SCREEN_AREA
  );
}

export interface LayerLaneScreenOverlay {
  laneId: string;
  title: string;
  layerPath: string;
  count: number;
  unclassified: boolean;
  header: {
    left: number;
    top: number;
    width: number;
  };
  outline: {
    mode: 'standard' | 'compact';
    bounds: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    clipped: {
      left: boolean;
      top: boolean;
      right: boolean;
      bottom: boolean;
    };
  };
}

export function createLayerLaneOverlays(
  lanes: readonly GraphLayerLaneRender[],
  viewport: { x: number; y: number; zoom: number },
  canvasSize: { width: number; height: number },
): LayerLaneScreenOverlay[] {
  if (canvasSize.width <= 0 || canvasSize.height <= 0) {
    return [];
  }

  return lanes
    .map((lane) => {
      const left = lane.bounds.x * viewport.zoom + viewport.x;
      const top = lane.bounds.y * viewport.zoom + viewport.y;
      const width = lane.bounds.width * viewport.zoom;
      const height = lane.bounds.height * viewport.zoom;
      const right = left + width;
      const bottom = top + height;

      if (
        right <= CANVAS_PADDING ||
        left >= canvasSize.width - CANVAS_PADDING ||
        bottom <= CANVAS_PADDING ||
        top >= canvasSize.height - CANVAS_PADDING
      ) {
        return null;
      }

      const visibleLeft = clamp(left, CANVAS_PADDING, canvasSize.width - CANVAS_PADDING);
      const visibleRight = clamp(right, CANVAS_PADDING, canvasSize.width - CANVAS_PADDING);
      const visibleWidth = visibleRight - visibleLeft;
      const visibleTop = clamp(top, CANVAS_PADDING, canvasSize.height - CANVAS_PADDING);
      const visibleBottom = clamp(bottom, CANVAS_PADDING, canvasSize.height - CANVAS_PADDING);
      const visibleHeight = visibleBottom - visibleTop;
      if (visibleWidth < MIN_VISIBLE_WIDTH || visibleHeight < MIN_VISIBLE_HEIGHT) {
        return null;
      }

      const headerWidth = clamp(visibleWidth, MIN_HEADER_WIDTH, MAX_HEADER_WIDTH);
      const headerLeft = clamp(
        visibleLeft,
        CANVAS_PADDING,
        Math.max(CANVAS_PADDING, canvasSize.width - CANVAS_PADDING - headerWidth),
      );
      const laneVisibleTop = clamp(top + HEADER_TOP_OFFSET, CANVAS_PADDING, canvasSize.height);
      const laneVisibleBottom = clamp(
        bottom - HEADER_HEIGHT - HEADER_TOP_OFFSET,
        CANVAS_PADDING,
        canvasSize.height - CANVAS_PADDING - HEADER_HEIGHT,
      );
      const headerTop = clamp(
        laneVisibleTop,
        CANVAS_PADDING,
        Math.max(CANVAS_PADDING, laneVisibleBottom),
      );
      const compact = shouldUseCompactLayerLane(lane, viewport.zoom);
      const outline = createLayerLaneOutline(
        { left, top, right, bottom },
        canvasSize,
        compact ? 'compact' : 'standard',
      );
      if (outline.bounds.width < MIN_OUTLINE_SIZE || outline.bounds.height < MIN_OUTLINE_SIZE) {
        return null;
      }

      return {
        laneId: lane.laneId,
        title: lane.unclassified ? 'unclassified' : lane.displayName || lane.layerPath,
        layerPath: lane.layerPath,
        count: lane.nodeIds.length,
        unclassified: lane.unclassified,
        header: {
          left: Math.round(headerLeft),
          top: Math.round(headerTop),
          width: Math.round(headerWidth),
        },
        outline,
      };
    })
    .filter((overlay): overlay is LayerLaneScreenOverlay => overlay != null);
}

const LayerLaneOverlay = memo(function LayerLaneOverlay({
  overlay,
}: {
  overlay: LayerLaneScreenOverlay;
}) {
  return (
    <>
      <div
        data-poc3-layer-lane={overlay.laneId}
        data-poc3-layer-lane-mode={
          overlay.outline.mode === 'compact' ? 'compact-outline' : 'outline'
        }
        data-poc3-layer-lane-clipped-left={overlay.outline.clipped.left}
        data-poc3-layer-lane-clipped-top={overlay.outline.clipped.top}
        data-poc3-layer-lane-clipped-right={overlay.outline.clipped.right}
        data-poc3-layer-lane-clipped-bottom={overlay.outline.clipped.bottom}
        className={`absolute rounded-[7px] border ${
          overlay.outline.mode === 'compact' ? 'border-dashed' : 'border-solid'
        } ${overlay.unclassified ? 'border-white/[0.1]' : 'border-[#58d7ff]/16'}`}
        style={getLayerLaneOutlineStyle(overlay)}
      />
      <div
        data-poc3-layer-lane={overlay.laneId}
        data-poc3-layer-lane-mode="header"
        className={`absolute h-[34px] rounded-[8px] border px-3 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.22)] ${
          overlay.unclassified
            ? 'border-white/[0.12] bg-[#090909]/88 text-white/54'
            : 'border-[#58d7ff]/24 bg-[#061015]/90 text-[#dff7ff]/72'
        }`}
        style={{
          left: overlay.header.left,
          top: overlay.header.top,
          width: overlay.header.width,
        }}
      >
        <LayerLaneLabel title={overlay.title} layerPath={overlay.layerPath} count={overlay.count} />
      </div>
    </>
  );
});

function createLayerLaneOutline(
  screenBounds: { left: number; top: number; right: number; bottom: number },
  canvasSize: { width: number; height: number },
  mode: 'standard' | 'compact',
): LayerLaneScreenOverlay['outline'] {
  const canvasLeft = CANVAS_PADDING;
  const canvasTop = CANVAS_PADDING;
  const canvasRight = canvasSize.width - CANVAS_PADDING;
  const canvasBottom = canvasSize.height - CANVAS_PADDING;
  const visibleLeft = clamp(screenBounds.left, canvasLeft, canvasRight);
  const visibleTop = clamp(screenBounds.top, canvasTop, canvasBottom);
  const visibleRight = clamp(screenBounds.right, canvasLeft, canvasRight);
  const visibleBottom = clamp(screenBounds.bottom, canvasTop, canvasBottom);

  return {
    mode,
    bounds: {
      left: Math.round(visibleLeft),
      top: Math.round(visibleTop),
      width: Math.round(visibleRight - visibleLeft),
      height: Math.round(visibleBottom - visibleTop),
    },
    clipped: {
      left: screenBounds.left < canvasLeft,
      top: screenBounds.top < canvasTop,
      right: screenBounds.right > canvasRight,
      bottom: screenBounds.bottom > canvasBottom,
    },
  };
}

function getLayerLaneOutlineStyle(overlay: LayerLaneScreenOverlay): CSSProperties {
  const visibleBorderColor = overlay.unclassified
    ? 'rgba(255,255,255,0.14)'
    : 'rgba(88,215,255,0.26)';
  const clippedBorderColor = overlay.unclassified
    ? 'rgba(255,255,255,0.07)'
    : 'rgba(88,215,255,0.1)';

  return {
    ...overlay.outline.bounds,
    borderLeftColor: overlay.outline.clipped.left ? clippedBorderColor : visibleBorderColor,
    borderTopColor: overlay.outline.clipped.top ? clippedBorderColor : visibleBorderColor,
    borderRightColor: overlay.outline.clipped.right ? clippedBorderColor : visibleBorderColor,
    borderBottomColor: overlay.outline.clipped.bottom ? clippedBorderColor : visibleBorderColor,
  };
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function LayerLaneLabel({
  title,
  layerPath,
  count,
}: {
  title: string;
  layerPath: string;
  count: number;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-[11px] font-semibold leading-4" title={layerPath}>
        {title}
      </span>
      {count > 0 ? (
        <span className="shrink-0 text-[10px] leading-4 text-white/34">{count}</span>
      ) : null}
    </div>
  );
}
