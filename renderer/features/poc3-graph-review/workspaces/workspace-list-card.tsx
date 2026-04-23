'use client';

import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ChevronDown, GitPullRequest, Layers3 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ReviewWorkspaceListItem } from './use-review-workspaces';

interface WorkspaceListCardProps {
  selectedWorkspace: ReviewWorkspaceListItem | null;
  otherWorkspaces: ReviewWorkspaceListItem[];
  onSelectWorkspace: (reviewWorkspaceId: string) => void;
}

const COLLAPSED_VISIBLE_COUNT = 3;
const ACTIVITY_ITEM_EASE = [0.4, 0, 0.2, 1] as const;

export function WorkspaceListCard({
  selectedWorkspace,
  otherWorkspaces,
  onSelectWorkspace,
}: WorkspaceListCardProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const visibleWorkspaces = showAll
    ? otherWorkspaces
    : otherWorkspaces.slice(0, COLLAPSED_VISIBLE_COUNT);
  const hasMore = otherWorkspaces.length > COLLAPSED_VISIBLE_COUNT;
  const subtitle = selectedWorkspace
    ? formatReviewSummary(selectedWorkspace)
    : 'Workspace はまだありません';
  const handleSelectWorkspace = (reviewWorkspaceId: string) => {
    onSelectWorkspace(reviewWorkspaceId);
    setOpen(false);
    setShowAll(false);
  };

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.5 }}>
      <motion.div
        layout
        className="pointer-events-auto w-[320px] overflow-hidden rounded-[7px] bg-[linear-gradient(180.9deg,rgba(51,51,57,0.7)_-0.58%,rgba(53,53,56,0.7)_66.34%,rgba(38,38,39,0.7)_101.25%)] p-1 text-white shadow-[4px_16px_36px_rgba(0,0,0,0.24),inset_0.5px_0.5px_0.5px_rgba(255,255,255,0.32),inset_0.5px_-0.5px_0.5px_rgba(255,255,255,0.05)] backdrop-blur-[36px] [background-color:rgba(62,62,62,0.4)]"
      >
        <motion.button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="group flex w-full items-center justify-between gap-3 rounded-[5px] px-3 py-[15px] transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/28"
          aria-expanded={open}
          aria-controls={listId}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/82">
              <Layers3 className="h-4 w-4" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-5 text-[#f2f2f2]">
                {selectedWorkspace?.repositoryLabel ?? 'Workspace'}
              </p>
              <p className="truncate text-xs leading-[17px] text-white/42">{subtitle}</p>
            </div>
          </div>

          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            className="flex size-5 shrink-0 items-center justify-center text-white/65 transition-colors group-hover:text-white/86"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </motion.span>
        </motion.button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="workspace-list"
              initial={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
              animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8, scale: 0.99 }}
              transition={{
                duration: 0.5,
                ease: ACTIVITY_ITEM_EASE,
                height: { duration: 0.5, ease: ACTIVITY_ITEM_EASE },
              }}
              id={listId}
              className="origin-top overflow-hidden border-t border-white/[0.06]"
            >
              <div>
                {visibleWorkspaces.length > 0 ? (
                  visibleWorkspaces.map((workspace, index) => (
                    <WorkspaceListItem
                      key={workspace.reviewWorkspaceId}
                      workspace={workspace}
                      index={index}
                      separated={index > 0}
                      onSelectWorkspace={handleSelectWorkspace}
                    />
                  ))
                ) : (
                  <div className="px-3 py-[15px] text-xs leading-[17px] text-white/42">
                    切り替え可能な Workspace はありません
                  </div>
                )}
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => setShowAll((current) => !current)}
                    className="w-full rounded-[5px] border-t border-white/[0.06] px-3 py-2.5 text-left text-xs font-medium text-[#d8e071] transition hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/28"
                  >
                    {showAll ? 'show less' : 'show more'}
                  </button>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}

function WorkspaceListItem({
  workspace,
  index,
  separated,
  onSelectWorkspace,
}: {
  workspace: ReviewWorkspaceListItem;
  index: number;
  separated: boolean;
  onSelectWorkspace: (reviewWorkspaceId: string) => void;
}) {
  const reviewSummary = useMemo(() => formatReviewSummary(workspace), [workspace]);

  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          delay: index * 0.075,
          duration: 0.5,
          ease: ACTIVITY_ITEM_EASE,
        },
      }}
      exit={{
        opacity: 0,
        y: 16,
        transition: {
          duration: 0.18,
          ease: ACTIVITY_ITEM_EASE,
        },
      }}
      onClick={() => onSelectWorkspace(workspace.reviewWorkspaceId)}
      className={`flex w-full min-w-0 items-center gap-3 rounded-[5px] px-3 py-[15px] text-left transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/28 ${
        separated ? 'border-t border-white/[0.06]' : ''
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/78">
        <GitPullRequest className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5 text-[#f2f2f2]">
          {workspace.repositoryLabel}
        </span>
        <span className="block truncate text-xs leading-[17px] text-white/42">{reviewSummary}</span>
      </span>
    </motion.button>
  );
}

function formatReviewSummary(workspace: ReviewWorkspaceListItem): string {
  const reviewLabel =
    workspace.provider === 'github' ? `PR #${workspace.reviewId}` : `MR !${workspace.reviewId}`;
  return `${reviewLabel} ${workspace.title}`;
}
