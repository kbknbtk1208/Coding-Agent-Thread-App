'use client';

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { FileCode2, FunctionSquare, MessageSquare, Package } from 'lucide-react';
import { motion } from 'motion/react';
import type { Poc3FlowNode } from './to-react-flow-elements';

export function Poc3GraphNode({ data, selected }: NodeProps<Poc3FlowNode>) {
  const graphNode = data.graphNode;
  const isFileHighlighted = data.isFileHighlighted;
  const Icon =
    graphNode.kind === 'module' || graphNode.kind === 'file-scope'
      ? FileCode2
      : graphNode.kind === 'external' || graphNode.kind === 'external-symbol'
        ? Package
        : FunctionSquare;
  const tone = graphNode.isDiffNode
    ? 'border-[#d8e071]/55 bg-[#d8e071]/14 text-[#f6ffc0]'
    : graphNode.kind === 'module' || graphNode.kind === 'file-scope'
      ? 'border-white/[0.12] bg-white/[0.045] text-white/82'
      : 'border-[#58d7ff]/28 bg-[#58d7ff]/10 text-[#dff7ff]';

  return (
    <div className="relative h-full w-full">
      {graphNode.badges.findingCount > 0 ? (
        <span
          className="absolute -right-4 -top-4 z-10 flex size-[36px] items-center justify-center rounded-full border-2 border-[#ff9a3c]/60 bg-[#1a1000] text-[16px] font-bold leading-none text-[#ffbf6b]"
          title={`${graphNode.badges.findingCount} findings`}
        >
          {graphNode.badges.findingCount}
        </span>
      ) : null}
      {selected ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[8px]"
          style={{
            backgroundImage:
              'linear-gradient(115deg, rgba(88,215,255,0.15) 0%, rgba(216,224,113,0.88) 25%, rgba(255,255,255,0.92) 50%, rgba(88,215,255,0.35) 70%, rgba(216,224,113,0.18) 100%)',
            backgroundSize: '200% 100%',
            padding: '1px',
          }}
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            opacity: [0.45, 0.92, 0.45],
          }}
          transition={{ duration: 2.4, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
        />
      ) : null}
      <div
        className={`relative flex h-full w-full items-center gap-2 rounded-[7px] border px-3 backdrop-blur-[12px] ${tone} ${
          selected
            ? 'border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_14px_36px_rgba(0,0,0,0.3)]'
            : isFileHighlighted
              ? 'shadow-[0_0_0_2px_rgba(251,146,60,0.65),0_0_16px_rgba(251,146,60,0.22),0_14px_36px_rgba(0,0,0,0.25)]'
              : 'shadow-[0_14px_36px_rgba(0,0,0,0.25)]'
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
        {graphNode.badges.remoteThreadCount > 0 ? (
          <span
            className="flex items-center gap-1 rounded-[5px] border border-[#58d7ff]/25 bg-[#58d7ff]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#dff7ff]"
            title={`${graphNode.badges.remoteThreadCount} remote threads`}
          >
            <MessageSquare className="size-3" aria-hidden="true" />
            {graphNode.badges.remoteThreadCount}
          </span>
        ) : null}
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-white/70" />
      </div>
    </div>
  );
}
