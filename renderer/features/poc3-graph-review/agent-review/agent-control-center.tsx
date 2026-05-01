'use client';

import { Bot, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import { ArchivedRemoteThreadSection } from '../provider-comments/archived-remote-thread-section';
import { useArchivedRemoteThreads } from '../provider-comments/use-archived-remote-threads';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';
import { isAgentReviewRunActive } from './agent-review-state';
import { AgentReviewHistoryList } from './agent-review-history-list';
import { AgentReviewNewRunPanel } from './agent-review-new-run-panel';
import { AgentReviewRunDetailPanel } from './agent-review-run-detail-panel';
import type { AgentReviewDockView, AgentReviewRun, SlideDirection } from './agent-review-types';
import { OutdatedThreadSection } from './outdated-thread-section';
import { useAgentReview } from './use-agent-review';
import { useOutdatedAgentThreads } from './use-outdated-agent-threads';

type AnimationStage =
  | 'collapsed'
  | 'widthExpanding'
  | 'heightExpanding'
  | 'fullyExpanded'
  | 'contentFadingOut'
  | 'heightCollapsing'
  | 'widthCollapsing';

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
  const [stage, setStage] = useState<AnimationStage>('collapsed');
  const [pendingCompletedNotice, setPendingCompletedNotice] = useState(false);
  const [view, setView] = useState<AgentReviewDockView>({ kind: 'history' });
  const [slideDirection, setSlideDirection] = useState<SlideDirection>('forward');
  const dockRef = useRef<HTMLDivElement | null>(null);
  const notifiedCompletedRunRef = useRef<string | null>(null);
  const stageRef = useRef<AnimationStage>('collapsed');
  stageRef.current = stage;

  const isCollapsed = stage === 'collapsed';
  const isExpanded = stage === 'fullyExpanded';
  const isRunning = review.activeRun !== null;

  const navigate = useCallback((nextView: AgentReviewDockView, direction: SlideDirection) => {
    setSlideDirection(direction);
    setView(nextView);
  }, []);

  const handleExpand = () => {
    setStage('widthExpanding');
    setTimeout(() => setStage('heightExpanding'), 400);
    setTimeout(() => setStage('fullyExpanded'), 850);
    setPendingCompletedNotice(false);
  };

  const handleCollapse = () => {
    setStage('contentFadingOut');
    setTimeout(() => setStage('heightCollapsing'), 250);
    setTimeout(() => setStage('widthCollapsing'), 650);
    setTimeout(() => setStage('collapsed'), 1050);
  };

  useEffect(() => {
    setView({ kind: 'history' });
    setSlideDirection('back');
  }, [selectedWorkspace.reviewWorkspaceId]);

  useEffect(() => {
    if (view.kind === 'run-detail') {
      const exists = review.runs.some((r) => r.runId === view.runId);
      if (!exists) {
        navigate({ kind: 'history' }, 'back');
      }
    }
  }, [navigate, review.runs, view]);

  useEffect(() => {
    const latest = review.latestRun;
    if (!latest || latest.runId === notifiedCompletedRunRef.current) return;
    if (latest.status === 'completed' || latest.status === 'fallback_rich_text') {
      notifiedCompletedRunRef.current = latest.runId;
      onCompleted?.();
      if (stageRef.current === 'collapsed') {
        setPendingCompletedNotice(true);
      }
    }
  }, [onCompleted, review.latestRun]);

  useEffect(() => {
    if (isCollapsed) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (stageRef.current !== 'fullyExpanded') return;

      const target = event.target;
      if (!(target instanceof Node) || dockRef.current?.contains(target)) return;

      handleCollapse();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isCollapsed]);

  const widthValue =
    stage === 'collapsed' || stage === 'widthCollapsing' ? TRIGGER_WIDTH : DOCK_WIDTH;
  const heightValue =
    stage === 'collapsed' || stage === 'widthExpanding' || stage === 'widthCollapsing'
      ? TRIGGER_HEIGHT
      : DOCK_HEIGHT;

  const activeRunForDetail =
    view.kind === 'run-detail' ? (review.runs.find((r) => r.runId === view.runId) ?? null) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4">
      <motion.div
        ref={dockRef}
        className="pointer-events-auto relative flex flex-col-reverse overflow-hidden"
        initial={{ width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT }}
        animate={{ width: widthValue, height: heightValue }}
        transition={{
          width: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
          height: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
        }}
        style={{
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(62,62,62,0.52) 0%, rgba(30,30,30,0.44) 100%)',
          backdropFilter: 'blur(36px)',
          WebkitBackdropFilter: 'blur(36px)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -24px 48px rgba(0,0,0,0.18), 0 8px 32px rgba(0,0,0,0.36)',
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 40%, rgba(0,0,0,0.1) 100%)',
          }}
        />

        <div
          role={isCollapsed ? 'button' : undefined}
          tabIndex={isCollapsed ? 0 : undefined}
          aria-expanded={isExpanded}
          aria-label={isCollapsed ? 'Agent Review を開く' : undefined}
          onClick={() => {
            if (isCollapsed) handleExpand();
          }}
          onKeyDown={(e) => {
            if (isCollapsed && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleExpand();
            }
          }}
          className={`relative z-10 flex h-12 w-full shrink-0 items-center gap-3 border-t border-white/[0.06] px-4 outline-none transition ${
            isCollapsed
              ? 'cursor-pointer hover:bg-white/[0.06] focus-visible:bg-white/[0.08]'
              : 'cursor-default'
          }`}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-[#58d7ff]/20 bg-[#58d7ff]/[0.08]">
            <Bot className="size-3.5 text-[#dff7ff]" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            {isCollapsed && isRunning ? (
              <span className="text-shimmer block truncate text-[12px] font-medium">
                Agent Review中です
              </span>
            ) : isCollapsed && pendingCompletedNotice ? (
              <span className="block truncate text-[12px] font-medium text-emerald-300/80">
                Agent Reviewが完了しました
              </span>
            ) : (
              <span className="block truncate text-[12px] font-medium text-white/55">
                Agent Review
              </span>
            )}
          </div>

          {!isCollapsed && review.activeRun ? <StatusPill run={review.activeRun} /> : null}

          <AnimatePresence>
            {!isCollapsed && (
              <motion.button
                key="close"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: isExpanded ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCollapse();
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                aria-label="Agent Review を閉じる"
              >
                <X size={12} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          className="relative z-10 min-h-0 flex-1 overflow-hidden"
          animate={{ opacity: isExpanded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <AnimatePresence initial={false} custom={slideDirection} mode="wait">
            {view.kind === 'history' ? (
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
                  isVisible={isExpanded}
                  onNew={() => navigate({ kind: 'new-review' }, 'forward')}
                  onSelectRun={(runId) => navigate({ kind: 'run-detail', runId }, 'forward')}
                />
                <div className="px-4 pb-3">
                  <OutdatedThreadSection threads={outdatedThreads.threads} />
                  <ArchivedRemoteThreadSection threads={archivedRemoteThreads.threads} />
                </div>
              </motion.div>
            ) : view.kind === 'new-review' ? (
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
                key={`run-detail-${view.runId}`}
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
                  detail={review.runDetailsById[view.runId] ?? null}
                  loading={review.detailLoadingRunId === view.runId}
                  errorMessage={review.detailErrorByRunId[view.runId] ?? null}
                  submittingPermissionKey={review.submittingPermissionKey}
                  onBack={() => navigate({ kind: 'history' }, 'back')}
                  onLoadDetail={review.loadRunDetail}
                  onRespondPermission={review.respondPermission}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}
    >
      {label}
    </span>
  );
}
