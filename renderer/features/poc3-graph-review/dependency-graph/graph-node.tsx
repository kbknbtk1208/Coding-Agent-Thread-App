'use client';

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { FileCode2, FunctionSquare, Package, TestTube2 } from 'lucide-react';
import { memo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { POC3_MOTION_DURATION, POC3_MOTION_EASE } from '../components/motion-timing';
import { Poc3LiquidMetalNodeBorder } from '../components/liquid-metal-node-border';
import type { Poc3CodeFlowNode } from './to-react-flow-elements';

export const Poc3GraphNode = memo(function Poc3GraphNode({
  data,
  selected,
}: NodeProps<Poc3CodeFlowNode>) {
  const shouldReduceMotion = useReducedMotion();
  const graphNode = data.graphNode;
  const isFileHighlighted = data.isFileHighlighted;
  const isViewportInteracting = data.isViewportInteracting;
  const layerStatus = graphNode.layer?.status ?? null;
  const layerLabel = graphNode.layer?.layerPath?.split('/').filter(Boolean).at(-1) ?? null;
  const Icon =
    graphNode.kind === 'module' || graphNode.kind === 'file-scope'
      ? FileCode2
      : graphNode.kind === 'external' || graphNode.kind === 'external-symbol'
        ? Package
        : FunctionSquare;
  const tone = graphNode.isDiffNode
    ? 'border-[#d8e071]/55 bg-[#d8e071]/14 text-[#f6ffc0]'
    : layerStatus === 'unclassified'
      ? 'border-white/[0.11] bg-white/[0.035] text-white/62'
      : layerStatus === 'ignored'
        ? 'border-white/[0.08] bg-white/[0.025] text-white/48'
        : graphNode.kind === 'module' || graphNode.kind === 'file-scope'
          ? 'border-white/[0.12] bg-white/[0.045] text-white/82'
          : 'border-[#58d7ff]/28 bg-[#58d7ff]/10 text-[#dff7ff]';
  const layerAccent =
    layerStatus === 'classified'
      ? 'bg-[#58d7ff]/55'
      : layerStatus === 'unclassified'
        ? 'bg-white/22'
        : layerStatus === 'ignored'
          ? 'bg-white/12'
          : null;

  return (
    <div className="relative h-full w-full">
      {graphNode.badges.findingCount > 0 ||
      graphNode.badges.remoteThreadCount > 0 ||
      graphNode.badges.hasCompanionCode ? (
        <span className="absolute -right-4 -top-4 z-10 flex items-center gap-1">
          {graphNode.badges.hasCompanionCode ? (
            <span
              className="flex size-[28px] items-center justify-center rounded-full border-2 border-[#9cff9c]/55 bg-[#061a06] text-[#baffba]"
              title={
                graphNode.isDiffNode ? '対応するテストコードあり' : '対応するプロダクトコードあり'
              }
            >
              {graphNode.isDiffNode ? (
                <TestTube2 className="size-3.5" aria-hidden="true" />
              ) : (
                <FileCode2 className="size-3.5" aria-hidden="true" />
              )}
            </span>
          ) : null}
          {graphNode.badges.remoteThreadCount > 0 ? (
            <span
              className="flex size-[28px] items-center justify-center rounded-full border-2 border-[#58d7ff]/60 bg-[#001a22] text-[13px] font-bold leading-none text-[#58d7ff]"
              title={`${graphNode.badges.remoteThreadCount} remote comments`}
            >
              {graphNode.badges.remoteThreadCount}
            </span>
          ) : null}
          {graphNode.badges.findingCount > 0 ? (
            <span
              className="flex size-[28px] items-center justify-center rounded-full border-2 border-[#ff9a3c]/60 bg-[#1a1000] text-[13px] font-bold leading-none text-[#ffbf6b]"
              title={`${graphNode.badges.findingCount} findings`}
            >
              {graphNode.badges.findingCount}
            </span>
          ) : null}
        </span>
      ) : null}
      {selected && !shouldReduceMotion && !isViewportInteracting ? (
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
          transition={{
            duration: POC3_MOTION_DURATION.selectedNodeSweep,
            ease: POC3_MOTION_EASE.linear,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      ) : null}
      {/*
       * Liquid metal wrapper: position:absolute inset:0.
       * When active, children are inset by borderWidth (2px), exposing the shader ring at the edge.
       * Badges and the selected-animation span intentionally live outside this wrapper so they
       * are not clipped by the wrapper's overflow:hidden.
       */}
      <Poc3LiquidMetalNodeBorder active={!selected && isFileHighlighted && !isViewportInteracting}>
        <div
          className={`relative flex h-full w-full items-center gap-2 rounded-[7px] border px-3 ${isViewportInteracting ? '' : 'backdrop-blur-[12px]'} ${tone} ${
            selected
              ? isViewportInteracting
                ? 'border-white/35'
                : 'border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_14px_36px_rgba(0,0,0,0.3)]'
              : isViewportInteracting
                ? ''
                : 'shadow-[0_14px_36px_rgba(0,0,0,0.25)]'
          }`}
        >
          {layerAccent ? (
            <span
              className={`pointer-events-none absolute bottom-2 left-1.5 top-2 w-0.5 rounded-full ${layerAccent}`}
              aria-hidden="true"
            />
          ) : null}
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
          {layerStatus === 'classified' && layerLabel ? (
            <span className="max-w-[72px] truncate rounded-[5px] border border-[#58d7ff]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#9eeaff]">
              {layerLabel}
            </span>
          ) : null}
          <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-white/70" />
        </div>
      </Poc3LiquidMetalNodeBorder>
    </div>
  );
});
