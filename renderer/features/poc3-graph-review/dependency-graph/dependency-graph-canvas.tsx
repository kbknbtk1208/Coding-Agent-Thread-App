'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { GraphRenderNode, GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import type { NodeDetailViewMode } from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewProviderKind } from '../../../../shared/poc3-domain/review-workspace';
import { NodeDetailPanel } from '../node-detail/node-detail-panel';
import type { NodeDetailScrollTarget } from '../node-detail/node-detail-scroll-target-context';
import { useNodeDetail } from '../node-detail/use-node-detail';
import { DEFAULT_GRAPH_RENDER_QUALITY, type GraphRenderQuality } from './graph-render-quality';
import { Poc3GraphNode } from './graph-node';
import { LayerLanesOverlay } from './layer-lanes-overlay';
import { LayerStatusStrip } from './layer-status-strip';
import type { Poc3FlowEdge, Poc3FlowNode } from './to-react-flow-elements';
import { useStableReactFlowElements } from './use-stable-react-flow-elements';

const nodeTypes = {
  poc3GraphNode: Poc3GraphNode,
};

const FIT_VIEW_OPTIONS = { padding: 0.28, maxZoom: 1.8 };
const VIEWPORT_POINTER_TARGET_SELECTOR = '.react-flow__pane, .react-flow__background';
const VIEWPORT_WHEEL_TARGET_SELECTOR =
  '.react-flow__pane, .react-flow__renderer, .react-flow__background, .react-flow__node';
const VIEWPORT_INTERACTION_EXCLUDED_SELECTOR = [
  '.react-flow__controls',
  '.react-flow__minimap',
  '[data-poc3-layer-lanes-overlay]',
  '[data-poc3-layer-status-strip]',
  '[data-poc3-node-detail-panel]',
].join(',');

export interface DependencyGraphCanvasProps {
  graph: GraphRenderSnapshot;
  reviewWorkspaceId: string;
  providerKind: ReviewProviderKind;
  highlightedFilePath?: string | null;
  selectedNodeId: string | null;
  scrollTarget?: NodeDetailScrollTarget | null;
  layerDisplayEnabled: boolean;
  layerWarningMessage?: string | null;
  renderQuality?: GraphRenderQuality;
  onSelectNode: (nodeId: string | null) => void;
  onLayerDisplayChange: (enabled: boolean) => void;
  onOpenLayerSettings?: () => void;
  onThreadResolved?: () => void;
}

export function DependencyGraphCanvas(props: DependencyGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <DependencyGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function DependencyGraphCanvasInner({
  graph,
  reviewWorkspaceId,
  providerKind,
  highlightedFilePath,
  selectedNodeId,
  scrollTarget,
  layerDisplayEnabled,
  layerWarningMessage,
  renderQuality = DEFAULT_GRAPH_RENDER_QUALITY,
  onSelectNode,
  onLayerDisplayChange,
  onOpenLayerSettings,
  onThreadResolved,
}: DependencyGraphCanvasProps) {
  const reactFlowRef = useRef<ReactFlowInstance<Poc3FlowNode, Poc3FlowEdge> | null>(null);
  const appliedViewportSnapshotRef = useRef<string | null>(null);
  const viewportInteractionEndTimerRef = useRef<number | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<NodeDetailViewMode>('function');
  const [reactFlowReady, setReactFlowReady] = useState(false);
  const [viewportInteracting, setViewportInteracting] = useState(false);
  const [nodeDetailRefreshKey, setNodeDetailRefreshKey] = useState(0);
  const graphViewKey = useMemo(
    () => `${graph.graphSnapshotId}:${graph.nodes.map((node) => node.nodeId).join('|')}`,
    [graph.graphSnapshotId, graph.nodes],
  );
  const viewState = useMemo(
    () => ({
      selectedNodeId,
      highlightedFilePath: highlightedFilePath ?? null,
      includeLayers: layerDisplayEnabled,
      renderQuality,
    }),
    [highlightedFilePath, layerDisplayEnabled, renderQuality, selectedNodeId],
  );
  const elements = useStableReactFlowElements(graph, viewState);
  const miniMapVisible = !viewportInteracting && !renderQuality.hideMiniMap;
  const layerLanesVisible = !renderQuality.hideLayerLanes;

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphRenderNode>();
    for (const node of graph.nodes) {
      map.set(node.nodeId, node);
    }
    return map;
  }, [graph.nodes]);

  const { state: nodeDetailState, reset: resetNodeDetail } = useNodeDetail({
    reviewWorkspaceId,
    scopeKey: graph.scopeKey,
    graphSnapshotId: graph.graphSnapshotId,
    selectedNodeId,
    viewMode: detailViewMode,
    refreshKey: nodeDetailRefreshKey,
  });

  useEffect(() => {
    appliedViewportSnapshotRef.current = null;
  }, [graph.graphSnapshotId]);

  useEffect(() => {
    onSelectNode(null);
    setDetailViewMode('function');
    resetNodeDetail();
  }, [onSelectNode, resetNodeDetail, reviewWorkspaceId]);

  useEffect(() => {
    if (!reactFlowReady || !reactFlowRef.current) {
      return;
    }

    if (viewportInteracting) {
      return;
    }

    if (appliedViewportSnapshotRef.current === graphViewKey) {
      return;
    }

    appliedViewportSnapshotRef.current = graphViewKey;

    const frameId = window.requestAnimationFrame(() => {
      const instance = reactFlowRef.current;
      if (!instance) {
        return;
      }
      if (graph.viewport) {
        void instance.setViewport(graph.viewport, { duration: 0 });
        return;
      }
      void instance.fitView(FIT_VIEW_OPTIONS);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [graph.graphSnapshotId, graph.viewport, graphViewKey, reactFlowReady, viewportInteracting]);

  useEffect(
    () => () => {
      if (viewportInteractionEndTimerRef.current) {
        window.clearTimeout(viewportInteractionEndTimerRef.current);
      }
    },
    [],
  );

  const handleViewportInteractionStart = useCallback(() => {
    if (viewportInteractionEndTimerRef.current) {
      window.clearTimeout(viewportInteractionEndTimerRef.current);
      viewportInteractionEndTimerRef.current = null;
    }
    setViewportInteracting(true);
  }, []);

  const handleViewportInteractionEnd = useCallback(() => {
    if (viewportInteractionEndTimerRef.current) {
      window.clearTimeout(viewportInteractionEndTimerRef.current);
    }
    viewportInteractionEndTimerRef.current = window.setTimeout(() => {
      setViewportInteracting(false);
      viewportInteractionEndTimerRef.current = null;
    }, 120);
  }, []);

  const handleViewportPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isViewportInteractionTarget(event.target, VIEWPORT_POINTER_TARGET_SELECTOR)) {
        return;
      }
      handleViewportInteractionStart();
    },
    [handleViewportInteractionStart],
  );

  const handleViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!isViewportInteractionTarget(event.target, VIEWPORT_WHEEL_TARGET_SELECTOR)) {
        return;
      }
      handleViewportInteractionStart();
      handleViewportInteractionEnd();
    },
    [handleViewportInteractionEnd, handleViewportInteractionStart],
  );

  const handleNodeClick = useCallback(
    (_: unknown, flowNode: Poc3FlowNode) => {
      if (flowNode.data.kind !== 'code') {
        return;
      }
      setDetailViewMode('function');
      onSelectNode(flowNode.data.graphNode.nodeId);
    },
    [onSelectNode],
  );

  const selectedNode = selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null;

  return (
    <div
      className="relative h-[calc(100vh-32px)] min-h-[640px] w-full overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#070707]/92"
      data-poc3-viewport-interacting={viewportInteracting ? 'true' : 'false'}
      onPointerDownCapture={handleViewportPointerDownCapture}
      onPointerUpCapture={handleViewportInteractionEnd}
      onPointerCancelCapture={handleViewportInteractionEnd}
      onWheelCapture={handleViewportWheel}
    >
      <div className="h-full w-full">
        <ReactFlow<Poc3FlowNode, Poc3FlowEdge>
          nodes={elements.nodes}
          edges={elements.edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onMoveStart={handleViewportInteractionStart}
          onMoveEnd={handleViewportInteractionEnd}
          onNodeDragStart={handleViewportInteractionStart}
          onNodeDragStop={handleViewportInteractionEnd}
          onInit={(instance) => {
            reactFlowRef.current = instance;
            setReactFlowReady(true);
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          nodeClickDistance={2}
          onlyRenderVisibleElements
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          {!viewportInteracting ? <Background color="rgba(255,255,255,0.08)" gap={32} /> : null}
          {miniMapVisible ? (
            <MiniMap
              pannable
              zoomable
              className={`!border !border-white/[0.1] !bg-[#111]/80 ${
                selectedNode ? '!left-4 !right-auto' : ''
              }`}
              nodeColor={(node) => {
                const flowNode = node as Poc3FlowNode;
                const graphNode = flowNode.data.graphNode;
                return graphNode.isDiffNode ? '#d8e071' : '#58d7ff';
              }}
            />
          ) : null}
          <Controls className="!border-white/[0.1] !bg-[#111]/80 [&_button]:!border-white/[0.08] [&_button]:!bg-transparent [&_button]:!text-white" />
        </ReactFlow>
        {layerDisplayEnabled && layerLanesVisible && graph.layers?.status === 'ready' ? (
          <LayerLanesOverlay
            lanes={graph.layers.lanes}
            hidden={viewportInteracting}
            dense={renderQuality.dense}
          />
        ) : null}
      </div>
      <div data-poc3-layer-status-strip>
        <LayerStatusStrip
          layers={graph.layers}
          enabled={layerDisplayEnabled}
          warningMessage={layerWarningMessage}
          onToggleEnabled={onLayerDisplayChange}
          onOpenLayerSettings={onOpenLayerSettings}
        />
      </div>
      {selectedNode ? (
        <div data-poc3-node-detail-panel>
          <NodeDetailPanel
            state={nodeDetailState}
            selectedNode={selectedNode}
            viewMode={detailViewMode}
            onViewModeChange={setDetailViewMode}
            onSelectNode={(nodeId) => {
              setDetailViewMode('function');
              onSelectNode(nodeId);
            }}
            onClose={() => onSelectNode(null)}
            onNodeDetailRefresh={() => setNodeDetailRefreshKey((k) => k + 1)}
            onThreadResolved={() => {
              setNodeDetailRefreshKey((k) => k + 1);
              onThreadResolved?.();
            }}
            providerKind={providerKind}
            scrollTarget={scrollTarget ?? null}
          />
        </div>
      ) : null}
    </div>
  );
}

function isViewportInteractionTarget(target: EventTarget, viewportSelector: string) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(VIEWPORT_INTERACTION_EXCLUDED_SELECTOR)) {
    return false;
  }
  return target.closest(viewportSelector) != null;
}
