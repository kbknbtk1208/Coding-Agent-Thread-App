'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphRenderNode, GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import type { NodeDetailViewMode } from '../../../../shared/poc3-contracts/graph-review-ipc';
import { NodeDetailPanel } from '../node-detail/node-detail-panel';
import { useNodeDetail } from '../node-detail/use-node-detail';
import { Poc3GraphNode } from './graph-node';
import { toReactFlowElements } from './to-react-flow-elements';
import type { Poc3FlowEdge, Poc3FlowNode } from './to-react-flow-elements';

const nodeTypes = {
  poc3GraphNode: Poc3GraphNode,
};

const FIT_VIEW_OPTIONS = { padding: 0.28, maxZoom: 1.8 };

export interface DependencyGraphCanvasProps {
  graph: GraphRenderSnapshot;
  reviewWorkspaceId: string;
  highlightedFilePath?: string | null;
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
  highlightedFilePath,
}: DependencyGraphCanvasProps) {
  const elements = useMemo(() => toReactFlowElements(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Poc3FlowNode>(elements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Poc3FlowEdge>(elements.edges);
  const reactFlowRef = useRef<ReactFlowInstance<Poc3FlowNode, Poc3FlowEdge> | null>(null);
  const appliedViewportSnapshotRef = useRef<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<NodeDetailViewMode>('function');
  const [reactFlowReady, setReactFlowReady] = useState(false);

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
  });

  useEffect(() => {
    setNodes(elements.nodes);
    setEdges(elements.edges);
  }, [elements.edges, elements.nodes, setEdges, setNodes]);

  useEffect(() => {
    appliedViewportSnapshotRef.current = null;
  }, [graph.graphSnapshotId]);

  useEffect(() => {
    setSelectedNodeId(null);
    setDetailViewMode('function');
    resetNodeDetail();
  }, [resetNodeDetail, reviewWorkspaceId]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const isSelected = node.id === selectedNodeId;
        if (node.selected === isSelected) {
          return node;
        }
        return { ...node, selected: isSelected };
      }),
    );
  }, [selectedNodeId, setNodes]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const highlighted =
          highlightedFilePath != null
            ? node.data.graphNode.filePath === highlightedFilePath
            : false;
        if (node.data.isFileHighlighted === highlighted) return node;
        return { ...node, data: { ...node.data, isFileHighlighted: highlighted } };
      }),
    );
  }, [highlightedFilePath, setNodes]);

  useEffect(() => {
    if (!reactFlowReady || !reactFlowRef.current) {
      return;
    }

    if (appliedViewportSnapshotRef.current === graph.graphSnapshotId) {
      return;
    }

    appliedViewportSnapshotRef.current = graph.graphSnapshotId;

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
  }, [graph.graphSnapshotId, graph.viewport, reactFlowReady]);

  const handleNodeClick = useCallback((_: unknown, flowNode: Poc3FlowNode) => {
    setDetailViewMode('function');
    setSelectedNodeId(flowNode.data.graphNode.nodeId);
  }, []);

  const selectedNode = selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null;

  return (
    <div className="relative h-[calc(100vh-32px)] min-h-[640px] w-full overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#070707]/92">
      <div className="h-full w-full">
        <ReactFlow<Poc3FlowNode, Poc3FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onInit={(instance) => {
            reactFlowRef.current = instance;
            setReactFlowReady(true);
          }}
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(255,255,255,0.08)" gap={32} />
          <MiniMap
            pannable
            zoomable
            className={`!border !border-white/[0.1] !bg-[#111]/80 ${
              selectedNode ? '!left-4 !right-auto' : ''
            }`}
            nodeColor={(node) => {
              const graphNode = (node as Poc3FlowNode).data.graphNode;
              return graphNode.isDiffNode ? '#d8e071' : '#58d7ff';
            }}
          />
          <Controls className="!border-white/[0.1] !bg-[#111]/80 [&_button]:!border-white/[0.08] [&_button]:!bg-transparent [&_button]:!text-white" />
        </ReactFlow>
      </div>
      {selectedNode ? (
        <NodeDetailPanel
          state={nodeDetailState}
          selectedNode={selectedNode}
          viewMode={detailViewMode}
          onViewModeChange={setDetailViewMode}
          onSelectNode={(nodeId) => {
            setDetailViewMode('function');
            setSelectedNodeId(nodeId);
          }}
          onClose={() => setSelectedNodeId(null)}
        />
      ) : null}
    </div>
  );
}
