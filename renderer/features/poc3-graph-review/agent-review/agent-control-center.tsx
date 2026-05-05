'use client';

import { Bot, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import { ArchivedRemoteThreadSection } from '../provider-comments/archived-remote-thread-section';
import { useArchivedRemoteThreads } from '../provider-comments/use-archived-remote-threads';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';
import { getDockAnimatedSize } from '../components/dock-animation-state';
import { DOCK_GLASS_STYLE, DOCK_SHEEN_STYLE } from '../components/use-dock-animation-stage';
import { useDockAnimationState } from '../components/use-dock-animation-state';
import { useOutsidePointerDown } from '../components/use-outside-pointer-down';
import { isAgentReviewRunActive } from './agent-review-state';
import { AgentReviewHistoryList } from './agent-review-history-list';
import { AgentReviewNewRunPanel } from './agent-review-new-run-panel';
import { AgentReviewRunDetailPanel } from './agent-review-run-detail-panel';
import type { AgentReviewDockView, AgentReviewRun, SlideDirection } from './agent-review-types';
import { OutdatedThreadSection } from './outdated-thread-section';
import { useAgentReview } from './use-agent-review';
import { useOutdatedAgentThreads } from './use-outdated-agent-threads';

const TRIGGER_WIDTH = 'min(90vw, 280px)';
const TRIGGER_HEIGHT = 48;
const DOCK_WIDTH = 'min(90vw, 480px)';
const DOCK_HEIGHT = 'min(80vh, 560px)';

const slideVariants = {
  enter: (direction: SlideDirection) => ({
    opacity: 0,
    x: direction === 'forward' ? 28 : -28,
    filter: 'blur(8px)',
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
  },
  exit: (direction: SlideDirection) => ({
    opacity: 0,
    x: direction === 'forward' ? -28 : 28,
    filter: 'blur(8px)',
  }),
};

export interface AgentControlCenterProps {
  graph: GraphRenderSnapshot;
  selectedWorkspace: ReviewWorkspaceListItem;
  onCompleted?(): void;
}

export function AgentControlCenter({
  graph,
  selectedWorkspace,
  onCompleted,
}: AgentControlCenterProps) {
  const review = useAgentReview(selectedWorkspace.reviewWorkspaceId);
  const outdatedThreads = useOutdatedAgentThreads(selectedWorkspace.reviewWorkspaceId);
  const archivedRemoteThreads = useArchivedRemoteThreads(selectedWorkspace.reviewWorkspaceId);
  const { phase, flags, open, close, handleSizeAnimationComplete } = useDockAnimationState();
  const animatedSize = getDockAnimatedSize(phase, {
    triggerWidth: TRIGGER_WIDTH,
    triggerHeight: TRIGGER_HEIGHT,
    dockWidth: DOCK_WIDTH,
    dockHeight: DOCK_HEIGHT,
  });
  const [pendingCompletedNotice, setPendingCompletedNotice] = useState(false);
  const [view, setView] = useState<AgentReviewDockView>({ kind: 'history' });
  const [slideDirection, setSlideDirection] = useState<SlideDirection>('forward');
  const dockRef = useRef<HTMLDivElement | null>(null);
  const notifiedCompletedRunRef = useRef<string | null>(null);
  const triggerId = useId();
  const panelId = useId();

  const isRunning = review.activeRun !== null;

  const navigate = useCallback((nextView: AgentReviewDockView, direction: SlideDirection) => {
    setSlideDirection(direction);
    setView(nextView);
  }, []);

  const openDock = useCallback(() => {
    open();
    setPendingCompletedNotice(false);
  }, [open]);

  const runById = useMemo(() => new Map(review.runs.map((run) => [run.runId, run])), [review.runs]);

  const activeRunForDetail = view.kind === 'run-detail' ? (runById.get(view.runId) ?? null) : null;

  const effectiveView =
    view.kind === 'run-detail' && activeRunForDetail === null
      ? ({ kind: 'history' } as const)
      : view;

  useEffect(() => {
    setView({ kind: 'history' });
    setSlideDirection('back');
  }, [selectedWorkspace.reviewWorkspaceId]);

  useEffect(() => {
    const latest = review.latestRun;
    if (!latest || latest.runId === notifiedCompletedRunRef.current) return;
    if (latest.status !== 'completed' && latest.status !== 'fallback_rich_text') return;

    notifiedCompletedRunRef.current = latest.runId;
    onCompleted?.();

    if (flags.isCollapsed) {
      setPendingCompletedNotice(true);
    }
  }, [flags.isCollapsed, onCompleted, review.latestRun]);

  useOutsidePointerDown({
    enabled: flags.isExpanded,
    refs: [dockRef],
    onOutside: close,
  });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4">
      <motion.div
        ref={dockRef}
        className="pointer-events-auto relative flex flex-col-reverse overflow-hidden"
        initial={{ width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT }}
        animate={{ width: animatedSize.width, height: animatedSize.height }}
        onAnimationComplete={handleSizeAnimationComplete}
        transition={{
          width: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
          height: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
        }}
        style={DOCK_GLASS_STYLE}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={DOCK_SHEEN_STYLE}
        />

        <div className="relative z-10 flex h-12 w-full shrink-0 items-center border-t border-white/[0.06]">
          <button
            id={triggerId}
            type="button"
            aria-expanded={flags.isExpanded}
            aria-controls={panelId}
            tabIndex={flags.canOpen ? 0 : -1}
            onClick={() => {
              if (flags.canOpen) openDock();
            }}
            className={`flex flex-1 items-center gap-3 px-4 h-full appearance-none border-0 bg-transparent text-left outline-none transition ${
              flags.canOpen
                ? 'cursor-pointer hover:bg-white/[0.06] focus-visible:bg-white/[0.08]'
                : 'cursor-default'
            }`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-[#58d7ff]/20 bg-[#58d7ff]/[0.08]">
              <Bot className="size-3.5 text-[#dff7ff]" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              {flags.isCollapsed && isRunning ? (
                <span className="text-shimmer block truncate text-[12px] font-medium">
                  Agent Review中です
                </span>
              ) : flags.isCollapsed && pendingCompletedNotice ? (
                <span className="block truncate text-[12px] font-medium text-emerald-300/80">
                  Agent Reviewが完了しました
                </span>
              ) : (
                <span className="block truncate text-[12px] font-medium text-white/55">
                  Agent Review
                </span>
              )}
            </div>
          </button>

          {!flags.isCollapsed && review.activeRun ? <StatusPill run={review.activeRun} /> : null}

          <AnimatePresence>
            {!flags.isCollapsed && (
              <motion.button
                key="close"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: flags.isExpanded ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => close()}
                className="mr-4 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                aria-label="Agent Review を閉じる"
              >
                <X size={12} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.section
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          aria-hidden={!flags.contentInteractive}
          className={`relative z-10 min-h-0 flex-1 overflow-hidden ${flags.contentInteractive ? '' : 'pointer-events-none'}`}
          animate={{ opacity: flags.contentOpacity }}
          transition={{ duration: 0.25 }}
        >
          <AnimatePresence initial={false} custom={slideDirection} mode="wait">
            {effectiveView.kind === 'history' ? (
              <motion.div
                key="history"
                custom={slideDirection}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0 overflow-y-auto"
              >
                <AgentReviewHistoryList
                  runs={review.runs}
                  activeRun={review.activeRun}
                  isVisible={flags.isExpanded}
                  onNew={() => navigate({ kind: 'new-review' }, 'forward')}
                  onSelectRun={(runId) => navigate({ kind: 'run-detail', runId }, 'forward')}
                />
                <div className="px-4 pb-3">
                  <OutdatedThreadSection threads={outdatedThreads.threads} />
                  <ArchivedRemoteThreadSection threads={archivedRemoteThreads.threads} />
                </div>
              </motion.div>
            ) : effectiveView.kind === 'new-review' ? (
              <motion.div
                key="new-review"
                custom={slideDirection}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0 overflow-y-auto"
              >
                <AgentReviewNewRunPanel
                  review={review}
                  graph={graph}
                  selectedWorkspace={selectedWorkspace}
                  onBack={() => navigate({ kind: 'history' }, 'back')}
                  onStarted={(runId) => navigate({ kind: 'run-detail', runId }, 'forward')}
                />
              </motion.div>
            ) : activeRunForDetail ? (
              <motion.div
                key={`run-detail-${effectiveView.runId}`}
                custom={slideDirection}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0 overflow-y-auto"
              >
                <AgentReviewRunDetailPanel
                  run={activeRunForDetail}
                  detail={review.runDetailsById[effectiveView.runId] ?? null}
                  loading={review.detailLoadingRunId === effectiveView.runId}
                  errorMessage={review.detailErrorByRunId[effectiveView.runId] ?? null}
                  submittingPermissionKey={review.submittingPermissionKey}
                  onBack={() => navigate({ kind: 'history' }, 'back')}
                  onLoadDetail={review.loadRunDetail}
                  onRespondPermission={review.respondPermission}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.section>
      </motion.div>
    </div>
  );
}

function StatusPill({ run }: { run: AgentReviewRun }) {
  const tone =
    run.status === 'failed'
      ? 'border-[#ff7d7d]/25 bg-[#ff7d7d]/10 text-[#ffd4d4]'
      : run.status === 'completed' || run.status === 'fallback_rich_text'
        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-50'
        : run.status === 'waiting_permission'
          ? 'border-[#ffbf6b]/25 bg-[#ffbf6b]/10 text-[#ffe0b5]'
          : 'border-[#58d7ff]/25 bg-[#58d7ff]/10 text-[#dff7ff]';

  const label = isAgentReviewRunActive(run.status)
    ? 'Processing'
    : run.status === 'completed' || run.status === 'fallback_rich_text'
      ? 'DONE'
      : 'FAILED';

  return (
    <span
      className={`mr-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}
    >
      {label}
    </span>
  );
}
