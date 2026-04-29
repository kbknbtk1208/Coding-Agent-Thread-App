'use client';

import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  MotionConfig,
} from 'motion/react';
import { ChevronDown, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { WorkspaceRevisionView } from '../../../../shared/poc3-domain/revision-commit';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';
import { CommitGraph } from './commit-graph';
import {
  COMMIT_LIST_INITIAL_VISIBLE_COUNT,
  shortRevisionSha,
  visibleCommitRows,
} from './commit-list-state';

const ACTIVITY_ITEM_EASE = [0.4, 0, 0.2, 1] as const;

export interface CommitListDockProps {
  selectedWorkspace: ReviewWorkspaceListItem;
  revisionView: WorkspaceRevisionView | null;
  refreshing: boolean;
  refreshError: string | null;
  onRefresh(): Promise<unknown>;
  onSelectRevision(revisionId: string): void;
}

export function CommitListDock({
  selectedWorkspace,
  revisionView,
  refreshing,
  refreshError,
  onRefresh,
  onSelectRevision,
}: CommitListDockProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDraggingRef = useRef(false);
  const commits = revisionView?.commits ?? [];
  const visibleCommits = visibleCommitRows(commits, showAll);
  const hasMore = commits.length > COMMIT_LIST_INITIAL_VISIBLE_COUNT;
  const activeSha = shortRevisionSha(revisionView?.activeHeadSha ?? null);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.5 }}>
        <motion.div
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          onDragStart={() => {
            isDraggingRef.current = true;
          }}
          onDragEnd={() => {
            requestAnimationFrame(() => {
              isDraggingRef.current = false;
            });
          }}
          layout
          className="pointer-events-auto w-[min(92vw,560px)] overflow-hidden rounded-[7px] bg-[linear-gradient(180.9deg,rgba(51,51,57,0.7)_-0.58%,rgba(53,53,56,0.7)_66.34%,rgba(38,38,39,0.7)_101.25%)] p-1 text-white shadow-[4px_16px_36px_rgba(0,0,0,0.24),inset_0.5px_0.5px_0.5px_rgba(255,255,255,0.32),inset_0.5px_-0.5px_0.5px_rgba(255,255,255,0.05)] backdrop-blur-[36px] [background-color:rgba(62,62,62,0.4)]"
          style={{ x, y }}
        >
          <div className="relative flex h-10 items-center gap-1 rounded-[5px] transition-colors hover:bg-white/[0.045]">
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-grab items-center gap-2 px-3 text-left active:cursor-grabbing"
              onPointerDown={(event) => dragControls.start(event)}
              onClick={() => {
                if (!isDraggingRef.current) {
                  setOpen((current) => !current);
                }
              }}
              aria-expanded={open}
            >
              <GitBranch className="size-4 shrink-0 text-white/65" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/72">
                {selectedWorkspace.repositoryLabel}
              </span>
              <code className="font-mono text-[10px] text-white/42">{activeSha}</code>
              <span className="text-[10px] text-white/38">{commits.length}</span>
              {refreshing ? <Loader2 className="size-3.5 animate-spin text-[#d8e071]" /> : null}
            </button>
            <button
              type="button"
              disabled={refreshing}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void onRefresh();
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-[5px] text-white/54 transition hover:bg-white/[0.07] hover:text-white/86 disabled:cursor-wait disabled:opacity-45"
              aria-label="Revision を更新"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-[5px] text-white/54 transition hover:bg-white/[0.07] hover:text-white/86"
              aria-label={open ? 'Commit list を閉じる' : 'Commit list を開く'}
            >
              <motion.span animate={{ rotate: open ? 180 : 0 }}>
                <ChevronDown className="size-4" />
              </motion.span>
            </button>
          </div>

          {refreshError ? (
            <p className="mx-2 my-2 rounded-[5px] border border-[#ff5c5c]/25 bg-[#ff5c5c]/10 px-2 py-1.5 text-xs leading-5 text-[#ffd1d1]">
              {refreshError}
            </p>
          ) : null}

          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="commit-list"
                initial={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
                animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
                transition={{
                  duration: 0.5,
                  ease: ACTIVITY_ITEM_EASE,
                  height: { duration: 0.5, ease: ACTIVITY_ITEM_EASE },
                }}
                className="origin-top overflow-hidden border-t border-white/[0.06]"
              >
                <CommitGraph commits={visibleCommits} onSelectRevision={onSelectRevision} />
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => setShowAll((current) => !current)}
                    className="w-full border-t border-white/[0.06] px-3 py-2 text-left text-xs font-medium text-[#d8e071] transition hover:bg-white/[0.045]"
                  >
                    {showAll ? 'show less' : 'show more'}
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </MotionConfig>
    </div>
  );
}
