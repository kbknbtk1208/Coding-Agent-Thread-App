'use client';

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { FileCode2, FunctionSquare, Package } from 'lucide-react';
import type { Poc3FlowNode } from './to-react-flow-elements';

export function Poc3GraphNode({ data, selected }: NodeProps<Poc3FlowNode>) {
  const graphNode = data.graphNode;
  const Icon =
    graphNode.kind === 'module'
      ? FileCode2
      : graphNode.kind === 'external'
        ? Package
        : FunctionSquare;
  const tone = graphNode.isDiffNode
    ? 'border-[#d8e071]/55 bg-[#d8e071]/14 text-[#f6ffc0]'
    : graphNode.kind === 'module'
      ? 'border-white/[0.12] bg-white/[0.045] text-white/82'
      : 'border-[#58d7ff]/28 bg-[#58d7ff]/10 text-[#dff7ff]';

  return (
    <div
      className={`relative flex h-full w-full items-center gap-2 rounded-[7px] border px-3 shadow-[0_14px_36px_rgba(0,0,0,0.25)] backdrop-blur-[12px] ${tone} ${
        selected ? 'ring-2 ring-white/42' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-white/70" />
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[5px] bg-black/20">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5">
          {graphNode.label}
        </span>
        <span className="block truncate text-[11px] leading-4 text-white/50">
          {graphNode.filePath ?? graphNode.kind}
        </span>
      </span>
      {graphNode.badges.changedLines > 0 ? (
        <span className="rounded-[5px] border border-[#d8e071]/25 px-1.5 py-0.5 text-[10px] font-semibold text-[#d8e071]">
          +{graphNode.badges.changedLines}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-white/70" />
    </div>
  );
}
