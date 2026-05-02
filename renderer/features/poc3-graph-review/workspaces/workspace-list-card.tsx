'use client';

import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  ChevronDown,
  GitPullRequest,
  Layers3,
  Loader2,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  RemoveReviewWorkspaceInput,
  RemoveReviewWorkspaceResult,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewWorkspaceListItem } from './use-review-workspaces';

interface WorkspaceListCardProps {
  selectedWorkspace: ReviewWorkspaceListItem | null;
  otherWorkspaces: ReviewWorkspaceListItem[];
  onSelectWorkspace: (reviewWorkspaceId: string) => void;
  removingWorkspaceId: string | null;
  removeError: string | null;
  onRemoveWorkspace: (
    reviewWorkspaceId: string,
    options?: Pick<RemoveReviewWorkspaceInput, 'force' | 'purgeDbOnly'>,
  ) => Promise<RemoveReviewWorkspaceResult>;
}

interface WorkspaceStatusBadge {
  label: string;
  tone: 'pending' | 'failed' | 'orphan';
}

function statusBadgeFor(workspace: ReviewWorkspaceListItem): WorkspaceStatusBadge | null {
  if (!workspace.worktreeExists) {
    return { label: '孤児', tone: 'orphan' };
  }
  if (workspace.setupStatus === 'failed' || workspace.analysisStatus === 'failed') {
    return { label: '失敗', tone: 'failed' };
  }
  if (workspace.setupStatus !== 'completed') {
    return { label: '未完了', tone: 'pending' };
  }
  return null;
}

function isSelectableWorkspace(workspace: ReviewWorkspaceListItem): boolean {
  return workspace.analysisStatus === 'completed' && workspace.worktreeExists;
}

const COLLAPSED_VISIBLE_COUNT = 3;
const ACTIVITY_ITEM_EASE = [0.4, 0, 0.2, 1] as const;

export function WorkspaceListCard({
  selectedWorkspace,
  otherWorkspaces,
  onSelectWorkspace,
  removingWorkspaceId,
  removeError,
  onRemoveWorkspace,
}: WorkspaceListCardProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openMenuWorkspaceId, setOpenMenuWorkspaceId] = useState<string | null>(null);
  const [forceTarget, setForceTarget] = useState<{
    workspace: ReviewWorkspaceListItem;
    message: string;
  } | null>(null);
  const [purgeDbTarget, setPurgeDbTarget] = useState<{
    workspace: ReviewWorkspaceListItem;
    message: string;
  } | null>(null);
  const listId = useId();
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const visibleWorkspaces = showAll
    ? otherWorkspaces
    : otherWorkspaces.slice(0, COLLAPSED_VISIBLE_COUNT);
  const hasMore = otherWorkspaces.length > COLLAPSED_VISIBLE_COUNT;
  const subtitle = selectedWorkspace
    ? formatReviewSummary(selectedWorkspace)
    : 'Workspace はまだありません';
  const selectedWorkspaceIsRemoving = selectedWorkspace?.reviewWorkspaceId === removingWorkspaceId;

  useEffect(() => {
    if (!openMenuWorkspaceId) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (
        menuRootRef.current &&
        event.target instanceof Node &&
        !menuRootRef.current.contains(event.target)
      ) {
        setOpenMenuWorkspaceId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openMenuWorkspaceId]);

  const handleSelectWorkspace = (reviewWorkspaceId: string) => {
    if (reviewWorkspaceId === removingWorkspaceId) {
      return;
    }
    const target =
      selectedWorkspace?.reviewWorkspaceId === reviewWorkspaceId
        ? selectedWorkspace
        : otherWorkspaces.find((item) => item.reviewWorkspaceId === reviewWorkspaceId);
    if (target && !isSelectableWorkspace(target)) {
      return;
    }
    onSelectWorkspace(reviewWorkspaceId);
    setOpen(false);
    setShowAll(false);
    setOpenMenuWorkspaceId(null);
  };

  const handleRemoveWorkspace = async (
    workspace: ReviewWorkspaceListItem,
    options: { force?: boolean; purgeDbOnly?: boolean } = {},
  ) => {
    if (workspace.reviewWorkspaceId === removingWorkspaceId) {
      return;
    }
    setOpenMenuWorkspaceId(null);
    const result = await onRemoveWorkspace(workspace.reviewWorkspaceId, {
      force: options.force,
      purgeDbOnly: options.purgeDbOnly,
    });
    if (!result.ok) {
      if (result.reason === 'forceRequired') {
        setForceTarget({ workspace, message: result.message });
        setPurgeDbTarget(null);
        return;
      }
      if (result.reason === 'lockHeld') {
        setPurgeDbTarget({ workspace, message: result.message });
        setForceTarget(null);
        return;
      }
      if (options.force) {
        setPurgeDbTarget({ workspace, message: result.message });
      }
      return;
    }
    setForceTarget(null);
    setPurgeDbTarget(null);
  };

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.5 }}>
      <motion.div
        layout
        ref={menuRootRef}
        className="pointer-events-auto w-[320px] rounded-[7px] bg-[linear-gradient(180.9deg,rgba(51,51,57,0.7)_-0.58%,rgba(53,53,56,0.7)_66.34%,rgba(38,38,39,0.7)_101.25%)] p-1 text-white shadow-[4px_16px_36px_rgba(0,0,0,0.24),inset_0.5px_0.5px_0.5px_rgba(255,255,255,0.32),inset_0.5px_-0.5px_0.5px_rgba(255,255,255,0.05)] backdrop-blur-[36px] [background-color:rgba(62,62,62,0.4)]"
      >
        <div
          className={`relative flex w-full items-center gap-1 rounded-[5px] transition-colors ${
            selectedWorkspaceIsRemoving ? 'opacity-60' : 'hover:bg-white/[0.045]'
          }`}
        >
          <motion.button
            type="button"
            disabled={selectedWorkspaceIsRemoving}
            onClick={() => setOpen((current) => !current)}
            className="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-[5px] px-3 py-[15px] text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/28 disabled:cursor-wait"
            aria-expanded={open}
            aria-controls={listId}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/82">
                <Layers3 className="h-4 w-4" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-semibold leading-5 text-[#f2f2f2]">
                    {selectedWorkspace?.repositoryLabel ?? 'Workspace'}
                  </p>
                  {selectedWorkspace ? (
                    <WorkspaceStatusBadgeView badge={statusBadgeFor(selectedWorkspace)} />
                  ) : null}
                </div>
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
          {selectedWorkspace ? (
            <WorkspaceActionMenu
              workspace={selectedWorkspace}
              open={openMenuWorkspaceId === selectedWorkspace.reviewWorkspaceId}
              removing={selectedWorkspaceIsRemoving}
              disabled={selectedWorkspaceIsRemoving}
              onToggle={() =>
                setOpenMenuWorkspaceId((current) =>
                  current === selectedWorkspace.reviewWorkspaceId
                    ? null
                    : selectedWorkspace.reviewWorkspaceId,
                )
              }
              onRemove={() => void handleRemoveWorkspace(selectedWorkspace)}
            />
          ) : null}
        </div>

        {removeError ? (
          <p className="mx-2 my-2 rounded-[5px] border border-[#ff5c5c]/25 bg-[#ff5c5c]/10 px-2 py-1.5 text-xs leading-5 text-[#ffd1d1]">
            {removeError}
          </p>
        ) : null}

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
              className={`origin-top border-t border-white/[0.06] ${
                openMenuWorkspaceId ? 'overflow-visible' : 'overflow-hidden'
              }`}
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
                      removing={removingWorkspaceId === workspace.reviewWorkspaceId}
                      disabled={removingWorkspaceId === workspace.reviewWorkspaceId}
                      menuOpen={openMenuWorkspaceId === workspace.reviewWorkspaceId}
                      onToggleMenu={() =>
                        setOpenMenuWorkspaceId((current) =>
                          current === workspace.reviewWorkspaceId
                            ? null
                            : workspace.reviewWorkspaceId,
                        )
                      }
                      onRemoveWorkspace={() => void handleRemoveWorkspace(workspace)}
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
      <ForceRemoveDialog
        target={forceTarget}
        removing={forceTarget?.workspace.reviewWorkspaceId === removingWorkspaceId}
        onCancel={() => setForceTarget(null)}
        onConfirm={() => {
          if (forceTarget) {
            void handleRemoveWorkspace(forceTarget.workspace, { force: true });
          }
        }}
      />
      <PurgeDbOnlyDialog
        target={purgeDbTarget}
        removing={purgeDbTarget?.workspace.reviewWorkspaceId === removingWorkspaceId}
        onCancel={() => setPurgeDbTarget(null)}
        onConfirm={() => {
          if (purgeDbTarget) {
            void handleRemoveWorkspace(purgeDbTarget.workspace, { purgeDbOnly: true });
          }
        }}
      />
    </MotionConfig>
  );
}

function WorkspaceListItem({
  workspace,
  index,
  separated,
  onSelectWorkspace,
  removing,
  disabled,
  menuOpen,
  onToggleMenu,
  onRemoveWorkspace,
}: {
  workspace: ReviewWorkspaceListItem;
  index: number;
  separated: boolean;
  onSelectWorkspace: (reviewWorkspaceId: string) => void;
  removing: boolean;
  disabled: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onRemoveWorkspace: () => void;
}) {
  const reviewSummary = useMemo(() => formatReviewSummary(workspace), [workspace]);
  const badge = statusBadgeFor(workspace);
  const selectable = isSelectableWorkspace(workspace);
  const selectDisabled = disabled || !selectable;

  return (
    <motion.div
      layout
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
      className={`relative flex w-full min-w-0 items-center gap-1 rounded-[5px] transition-colors ${
        removing ? 'opacity-60' : selectDisabled ? '' : 'hover:bg-white/[0.045]'
      } ${separated ? 'border-t border-white/[0.06]' : ''}`}
    >
      <button
        type="button"
        disabled={selectDisabled}
        onClick={() => onSelectWorkspace(workspace.reviewWorkspaceId)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[5px] px-3 py-[15px] text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/28 disabled:cursor-wait"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/78">
          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block truncate text-[13px] font-semibold leading-5 text-[#f2f2f2]">
              {workspace.repositoryLabel}
            </span>
            <WorkspaceStatusBadgeView badge={badge} />
          </span>
          <span className="block truncate text-xs leading-[17px] text-white/42">
            {reviewSummary}
          </span>
        </span>
      </button>
      <WorkspaceActionMenu
        workspace={workspace}
        open={menuOpen}
        removing={removing}
        disabled={disabled}
        onToggle={onToggleMenu}
        onRemove={onRemoveWorkspace}
      />
    </motion.div>
  );
}

function WorkspaceActionMenu({
  workspace,
  open,
  removing,
  disabled,
  onToggle,
  onRemove,
}: {
  workspace: ReviewWorkspaceListItem;
  open: boolean;
  removing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  if (removing) {
    return (
      <span className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-[5px] text-white/58">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }

  return (
    <div className="relative mr-2 shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className="flex size-8 items-center justify-center rounded-[5px] text-white/54 transition hover:bg-white/[0.07] hover:text-white/86 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/28 disabled:cursor-wait disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-white/54"
        aria-label={`${workspace.repositoryLabel} の操作`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, x: -4, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: ACTIVITY_ITEM_EASE }}
            className="absolute left-full top-0 z-30 ml-2 w-28 rounded-[6px] border border-white/[0.1] bg-[#191919]/95 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.38)] backdrop-blur-[18px]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs font-medium text-[#ffb4b4] transition hover:bg-[#ff5c5c]/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ffb4b4]/40"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              削除
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ForceRemoveDialog({
  target,
  removing,
  onCancel,
  onConfirm,
}: {
  target: { workspace: ReviewWorkspaceListItem; message: string } | null;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {target ? (
        <motion.div
          key="poc3-force-remove-layer"
          className="pointer-events-auto fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: ACTIVITY_ITEM_EASE }}
        >
          <div className="absolute inset-0 bg-black/32 backdrop-blur-[6px]" />
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="poc3-force-remove-title"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: ACTIVITY_ITEM_EASE }}
              className="w-[min(92vw,440px)] rounded-[8px] border border-white/[0.12] bg-[#171717]/92 p-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-[18px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="poc3-force-remove-title" className="text-sm font-semibold text-white">
                    強制削除しますか
                  </h2>
                  <p className="mt-1 truncate text-xs text-white/52">
                    {target.workspace.repositoryLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={removing}
                  className="flex size-8 shrink-0 items-center justify-center rounded-[5px] text-white/62 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-50"
                  aria-label="Close force remove dialog"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#d5d5d5]">
                通常の worktree 削除に失敗しました。未コミット変更を含めて削除します。
              </p>
              <p className="mt-2 rounded-[6px] border border-[#ff5c5c]/20 bg-[#ff5c5c]/10 px-3 py-2 text-xs leading-5 text-[#ffd1d1]">
                {target.message}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={removing}
                  className="rounded-[6px] border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-white/24 disabled:cursor-wait disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={removing}
                  className="flex items-center gap-2 rounded-[6px] bg-[#ff5c5c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#ff7373] disabled:cursor-wait disabled:opacity-60"
                >
                  {removing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Force Delete
                </button>
              </div>
            </motion.section>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function PurgeDbOnlyDialog({
  target,
  removing,
  onCancel,
  onConfirm,
}: {
  target: { workspace: ReviewWorkspaceListItem; message: string } | null;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {target ? (
        <motion.div
          key="poc3-purge-db-only-layer"
          className="pointer-events-auto fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: ACTIVITY_ITEM_EASE }}
        >
          <div className="absolute inset-0 bg-black/32 backdrop-blur-[6px]" />
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="poc3-purge-db-only-title"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: ACTIVITY_ITEM_EASE }}
              className="w-[min(92vw,460px)] rounded-[8px] border border-white/[0.12] bg-[#171717]/92 p-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-[18px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="poc3-purge-db-only-title" className="text-sm font-semibold text-white">
                    DB レコードのみ削除しますか
                  </h2>
                  <p className="mt-1 truncate text-xs text-white/52">
                    {target.workspace.repositoryLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={removing}
                  className="flex size-8 shrink-0 items-center justify-center rounded-[5px] text-white/62 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-50"
                  aria-label="Close purge db only dialog"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#d5d5d5]">
                git worktree remove が完了できません (ファイルロックや worktree
                メタデータの不整合など)。DB レコードだけ削除すると、worktree
                ディレクトリは手動掃除待ちで残ります。
              </p>
              <p className="mt-2 rounded-[6px] border border-[#facc15]/30 bg-[#facc15]/10 px-3 py-2 text-xs leading-5 text-[#fde68a]">
                {target.message}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={removing}
                  className="rounded-[6px] border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-white/24 disabled:cursor-wait disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={removing}
                  className="flex items-center gap-2 rounded-[6px] bg-[#facc15] px-3 py-2 text-sm font-semibold text-[#1f1300] transition hover:bg-[#fde047] disabled:cursor-wait disabled:opacity-60"
                >
                  {removing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Purge DB Only
                </button>
              </div>
            </motion.section>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function WorkspaceStatusBadgeView({ badge }: { badge: WorkspaceStatusBadge | null }) {
  if (!badge) {
    return null;
  }
  const toneClass =
    badge.tone === 'orphan'
      ? 'border-[#facc15]/30 bg-[#facc15]/10 text-[#fde68a]'
      : badge.tone === 'failed'
        ? 'border-[#ff5c5c]/30 bg-[#ff5c5c]/10 text-[#ffd1d1]'
        : 'border-white/15 bg-white/[0.06] text-white/70';
  return (
    <span
      className={`shrink-0 rounded-[3px] border px-1 py-[1px] text-[10px] font-medium leading-[14px] ${toneClass}`}
    >
      {badge.label}
    </span>
  );
}

function formatReviewSummary(workspace: ReviewWorkspaceListItem): string {
  const reviewLabel =
    workspace.provider === 'github' ? `PR #${workspace.reviewId}` : `MR !${workspace.reviewId}`;
  return `${reviewLabel} ${workspace.title}`;
}
