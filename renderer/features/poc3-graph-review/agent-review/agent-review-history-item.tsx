'use client';

import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import {
  getAgentLabel,
  getCommitLabel,
  getModelLabel,
  getStatusLabel,
} from './agent-review-dock-state';
import type { AgentReviewRun } from './agent-review-types';

export interface AgentReviewHistoryItemProps {
  run: AgentReviewRun;
  index: number;
  isVisible: boolean;
  onClick(): void;
}

const ACTIVITY_ITEM_EASE = [0.4, 0, 0.2, 1] as const;
const ITEM_ENTER_BASE_DELAY = 0.16;
const ITEM_ENTER_STAGGER = 0.055;
const ITEM_SLIDE_DISTANCE = -18;

const STATUS_TONE = {
  Processing: 'border-[#58d7ff]/25 bg-[#58d7ff]/10 text-[#dff7ff]',
  DONE: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-50',
  FAILED: 'border-[#ff7d7d]/25 bg-[#ff7d7d]/10 text-[#ffd4d4]',
} as const;

export function AgentReviewHistoryItem({
  run,
  index,
  isVisible,
  onClick,
}: AgentReviewHistoryItemProps) {
  const statusLabel = getStatusLabel(run.status);
  const agentLabel = getAgentLabel(run.agent);
  const modelLabel = getModelLabel(run);
  const { shortSha, message } = getCommitLabel(run.commit);
  const toneCls = STATUS_TONE[statusLabel];
  const enterDelay = ITEM_ENTER_BASE_DELAY + index * ITEM_ENTER_STAGGER;

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, x: ITEM_SLIDE_DISTANCE, y: 8 }}
      animate={{
        opacity: isVisible ? 1 : 0,
        x: isVisible ? 0 : ITEM_SLIDE_DISTANCE,
        y: isVisible ? 0 : 8,
        transition: {
          delay: enterDelay,
          duration: 0.42,
          ease: ACTIVITY_ITEM_EASE,
          opacity: {
            delay: enterDelay,
            duration: 0.42,
            ease: ACTIVITY_ITEM_EASE,
          },
          x: {
            delay: enterDelay,
            duration: 0.42,
            ease: ACTIVITY_ITEM_EASE,
          },
        },
      }}
      exit={{
        opacity: 0,
        x: ITEM_SLIDE_DISTANCE / 2,
        y: 6,
        transition: { duration: 0.18, ease: ACTIVITY_ITEM_EASE },
      }}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[5px] border-t border-white/[0.06] px-2 py-2 text-left transition-colors hover:bg-white/[0.045] first:border-t-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${toneCls}`}
          >
            {statusLabel}
          </span>
          <span className="truncate text-[11px] text-white/55">
            {agentLabel}
            {modelLabel ? ` / ${modelLabel}` : ''}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate">
          <span className="shrink-0 font-mono text-[10px] text-white/38">{shortSha}</span>
          <span className="truncate text-[10px] text-white/38">{message}</span>
        </div>
      </div>

      <ChevronRight className="size-3.5 shrink-0 text-white/28" aria-hidden="true" />
    </motion.button>
  );
}
