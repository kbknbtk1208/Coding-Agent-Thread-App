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
import { NodeDetailPopover } from '../node-detail/node-detail-popover';
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
}

export function DependencyGraphCanvas(props: DependencyGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <DependencyGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function DependencyGraphCanvasInner({ graph, reviewWorkspaceId }: DependencyGraphCanvasProps) {
  const elements = useMemo(() => toReactFlowElements(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Poc3FlowNode>(elements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Poc3FlowEdge>(elements.edges);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<Poc3FlowNode, Poc3FlowEdge> | null>(null);
  const appliedViewportSnapshotRef = useRef<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
  });

  useEffect(() => {
    setNodes(elements.nodes);
    setEdges(elements.edges);
  }, [elements.edges, elements.nodes, setEdges, setNodes]);

  useEffect(() => {
    setSelectedNodeId(null);
    resetNodeDetail();
    appliedViewportSnapshotRef.current = null;
  }, [graph.graphSnapshotId, resetNodeDetail]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedNodeId) {
        setSelectedNodeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId]);

  const handleNodeClick = useCallback((_: unknown, flowNode: Poc3FlowNode) => {
    setSelectedNodeId(flowNode.data.graphNode.nodeId);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleSelectRelatedNode = useCallback(
    (nodeId: string) => {
      if (!nodeById.has(nodeId)) {
        return;
      }
      setSelectedNodeId(nodeId);
    },
    [nodeById],
  );

  const selectedNode = selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null;

  return (
    <div
      ref={containerRef}
      className="relative h-[calc(100vh-170px)] min-h-[520px] w-full overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#070707]/92"
    >
      <ReactFlow<Poc3FlowNode, Poc3FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
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
          className="!border !border-white/[0.1] !bg-[#111]/80"
          nodeColor={(node) => {
            const graphNode = (node as Poc3FlowNode).data.graphNode;
            return graphNode.isDiffNode ? '#d8e071' : '#58d7ff';
          }}
        />
        <Controls className="!border-white/[0.1] !bg-[#111]/80 [&_button]:!border-white/[0.08] [&_button]:!bg-transparent [&_button]:!text-white" />
      </ReactFlow>
      {selectedNode ? (
        <NodeDetailPopover
          state={nodeDetailState}
          selectedNode={selectedNode}
          containerRef={containerRef}
          onClose={() => setSelectedNodeId(null)}
          onSelectRelatedNode={handleSelectRelatedNode}
        />
      ) : null}
    </div>
  );
}
