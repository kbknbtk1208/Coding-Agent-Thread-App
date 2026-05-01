'use client';

import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AgentReviewHistoryItem } from './agent-review-history-item';
import type { AgentReviewRun } from './agent-review-types';

export interface AgentReviewHistoryListProps {
  runs: AgentReviewRun[];
  activeRun: AgentReviewRun | null;
  isVisible: boolean;
  onNew(): void;
  onSelectRun(runId: string): void;
}

const ACTIVITY_ITEM_EASE = [0.4, 0, 0.2, 1] as const;

export function AgentReviewHistoryList({
  runs,
  activeRun,
  isVisible,
  onNew,
  onSelectRun,
}: AgentReviewHistoryListProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <button
          type="button"
          onClick={onNew}
          className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.04] text-white/55 transition hover:bg-white/[0.1] hover:text-white"
          aria-label="新規 Review を作成"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
        <span className="flex-1 text-center text-[11px] font-semibold text-white/55">
          Agent Review
        </span>
        {activeRun ? (
          <span className="rounded-full border border-[#58d7ff]/25 bg-[#58d7ff]/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-[#dff7ff]">
            Processing
          </span>
        ) : (
          <div className="size-6" />
        )}
      </div>

      <AnimatePresence initial={false}>
        {runs.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
            animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
            transition={{
              duration: 0.5,
              ease: ACTIVITY_ITEM_EASE,
              height: { duration: 0.5, ease: ACTIVITY_ITEM_EASE },
            }}
            className="px-4 py-6 text-center"
          >
            <p className="text-[11px] text-white/28">Review 履歴がありません</p>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
            animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
            transition={{
              duration: 0.5,
              ease: ACTIVITY_ITEM_EASE,
              height: { duration: 0.5, ease: ACTIVITY_ITEM_EASE },
            }}
            className="flex flex-col px-2 py-1"
          >
            <AnimatePresence>
              {runs.map((run, index) => (
                <AgentReviewHistoryItem
                  key={run.runId}
                  run={run}
                  index={index}
                  isVisible={isVisible}
                  onClick={() => onSelectRun(run.runId)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
