'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import { Poc3GraphNode } from './graph-node';
import { toReactFlowElements } from './to-react-flow-elements';
import type { Poc3FlowEdge, Poc3FlowNode } from './to-react-flow-elements';

const nodeTypes = {
  poc3GraphNode: Poc3GraphNode,
};

const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.8 };

export function DependencyGraphCanvas({ graph }: { graph: GraphRenderSnapshot }) {
  const elements = useMemo(() => toReactFlowElements(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Poc3FlowNode>(elements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Poc3FlowEdge>(elements.edges);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<Poc3FlowNode, Poc3FlowEdge> | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    setNodes(elements.nodes);
    setEdges(elements.edges);
  }, [elements.edges, elements.nodes, setEdges, setNodes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const queueFitView = () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        void reactFlowRef.current?.fitView(FIT_VIEW_OPTIONS);
      });
    };

    const observer = new ResizeObserver(() => {
      queueFitView();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-170px)] min-h-[520px] w-full overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#070707]/92"
    >
      <ReactFlow<Poc3FlowNode, Poc3FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
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
    </div>
  );
}
