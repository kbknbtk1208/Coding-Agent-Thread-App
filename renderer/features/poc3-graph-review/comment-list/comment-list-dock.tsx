'use client';

import {
  AnimatePresence,
  motion,
  MotionConfig,
  useDragControls,
  useMotionValue,
} from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, Wand2 } from 'lucide-react';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CommentListItem } from './use-comment-list';
import { ResolveThreadButton } from '../thread-resolve/resolve-thread-button';
import type {
  ResolveJudgementRunState,
  ResolveJudgementViewModel,
} from '../resolve-judgement/use-resolve-judgements';

const EASE = [0.4, 0, 0.2, 1] as const;

const RESOLVABLE_COLOR = '#7ee2b8';
const UNRESOLVABLE_COLOR = '#ff8470';

interface CommentListDockProps {
  items: CommentListItem[];
  resultsByKey: ReadonlyMap<string, ResolveJudgementViewModel>;
  runState: ResolveJudgementRunState;
  onSelectComment: (item: CommentListItem) => void;
  onStartResolveJudgement: () => void;
  onThreadResolved?: () => void;
  toResolveKey: (item: CommentListItem) => string;
}

export function CommentListDock({
  items,
  resultsByKey,
  runState,
  onSelectComment,
  onStartResolveJudgement,
  onThreadResolved,
  toResolveKey,
}: CommentListDockProps) {
  const [open, setOpen] = useState(false);
  const [resolvedKeys, setResolvedKeys] = useState<ReadonlySet<string>>(new Set());
  const [inFlightKey, setInFlightKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const dragControls = useDragControls();
  const listParentRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDraggingRef = useRef(false);

  const visibleItems = items.filter((item) => !resolvedKeys.has(item.key));
  const agentCount = visibleItems.filter((i) => i.type === 'agent').length;
  const remoteCount = visibleItems.filter((i) => i.type === 'remote').length;
  const isRunning = runState.status === 'running';
  const useVirtualList = visibleItems.length > 50;
  const rowVirtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 64,
    enabled: useVirtualList,
  });

  if (items.length === 0) return null;
  if (visibleItems.length === 0 && !notice) return null;

  const headerLabel =
    runState.status === 'empty'
      ? '判定対象なし'
      : open
        ? 'Comments'
        : [
            agentCount > 0 ? `${String(agentCount)} Agent Thread` : null,
            remoteCount > 0 ? `${String(remoteCount)} Remote Comment` : null,
          ]
            .filter(Boolean)
            .join(' / ');

  return (
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
        className="fixed bottom-8 right-[calc(50%+148px)] z-30 w-[280px] overflow-hidden rounded-[7px] p-1 text-white shadow-[4px_16px_36px_rgba(0,0,0,0.24),inset_0.5px_0.5px_0.5px_rgba(255,255,255,0.32),inset_0.5px_-0.5px_0.5px_rgba(255,255,255,0.05)] backdrop-blur-[36px] [background-color:rgba(62,62,62,0.4)] [background-image:linear-gradient(180.9deg,rgba(51,51,57,0.7)_-0.58%,rgba(53,53,56,0.7)_66.34%,rgba(38,38,39,0.7)_101.25%)]"
        style={{ x, y }}
      >
        <div className="flex w-full items-center gap-1 rounded-[5px] pr-1 transition-colors">
          <button
            type="button"
            className="flex flex-1 cursor-grab items-center gap-2 rounded-[5px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045] active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
            onClick={() => {
              if (!isDraggingRef.current) setOpen((prev) => !prev);
            }}
            aria-expanded={open}
          >
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/72">
              {isRunning ? <ResolveJudgementShimmerText /> : headerLabel}
            </span>
            <motion.span animate={{ rotate: open ? 180 : 0 }}>
              <ChevronDown className="size-4 shrink-0 text-white/54" />
            </motion.span>
          </button>
          <ResolveJudgementHeaderAction
            runState={runState}
            onStart={onStartResolveJudgement}
            disabled={isDraggingRef.current}
          />
        </div>
        {notice ? (
          <div className="mx-2 mb-1 rounded-[5px] border border-[#ff8470]/25 bg-[#ff8470]/10 px-2 py-1 text-[10px] leading-4 text-[#ffd2c8]">
            {notice}
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {open && visibleItems.length > 0 ? (
            <motion.div
              key="comment-list"
              initial={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8 }}
              animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8 }}
              transition={{ duration: 0.5, ease: EASE, height: { duration: 0.5, ease: EASE } }}
              className="origin-top overflow-hidden border-t border-white/[0.06]"
            >
              <div ref={listParentRef} className="max-h-[400px] overflow-y-auto py-1">
                {useVirtualList ? (
                  <div
                    className="relative"
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = visibleItems[virtualRow.index];
                      return (
                        <div
                          key={item.key}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="absolute left-0 top-0 w-full"
                          style={{ transform: `translateY(${String(virtualRow.start)}px)` }}
                        >
                          <CommentListRow
                            item={item}
                            judgement={resultsByKey.get(toResolveKey(item)) ?? null}
                            error={errorByKey[item.key] ?? null}
                            inFlight={inFlightKey === item.key}
                            onSelectComment={onSelectComment}
                            onResolve={async () => {
                              setInFlightKey(item.key);
                              setErrorByKey((current) => ({ ...current, [item.key]: '' }));
                              setNotice(null);
                              await resolveCommentItem({
                                item,
                                setInFlightKey,
                                setNotice,
                                setResolvedKeys,
                                setErrorByKey,
                                onThreadResolved,
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  visibleItems.map((item) => (
                    <CommentListRow
                      key={item.key}
                      item={item}
                      judgement={resultsByKey.get(toResolveKey(item)) ?? null}
                      error={errorByKey[item.key] ?? null}
                      inFlight={inFlightKey === item.key}
                      onSelectComment={onSelectComment}
                      onResolve={async () => {
                        setInFlightKey(item.key);
                        setErrorByKey((current) => ({ ...current, [item.key]: '' }));
                        setNotice(null);
                        await resolveCommentItem({
                          item,
                          setInFlightKey,
                          setNotice,
                          setResolvedKeys,
                          setErrorByKey,
                          onThreadResolved,
                        });
                      }}
                    />
                  ))
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}

function ResolveJudgementHeaderAction({
  runState,
  onStart,
  disabled,
}: {
  runState: ResolveJudgementRunState;
  onStart: () => void;
  disabled: boolean;
}) {
  const isRunning = runState.status === 'running';
  const isFailed = runState.status === 'failed';
  const isEmpty = runState.status === 'empty';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && !isRunning) onStart();
      }}
      disabled={disabled || isRunning}
      title={
        isRunning
          ? 'resolve 判定を実行中です'
          : isFailed
            ? `判定に失敗: ${runState.message}`
            : isEmpty
              ? runState.message
              : 'コメントの resolve 可否を Agent に判定させる'
      }
      aria-label="Resolve判定を開始"
      className={`flex size-7 cursor-pointer items-center justify-center rounded-full border text-white/70 transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed ${
        isRunning
          ? 'border-white/15 bg-white/[0.04] text-white/40'
          : isFailed
            ? 'border-[#ff8470]/35 bg-[#ff8470]/10 text-[#ffd2c8] hover:border-[#ff8470]/55 hover:bg-[#ff8470]/15 focus-visible:ring-[#ff8470]/35'
            : 'border-[#7ee2b8]/22 bg-[#7ee2b8]/[0.06] text-[#cdf6e3] hover:border-[#7ee2b8]/45 hover:bg-[#7ee2b8]/14 focus-visible:ring-[#7ee2b8]/35'
      }`}
    >
      <Wand2 className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function ResolveJudgementShimmerText() {
  return <span className="poc3-resolve-shimmer-text">resolve 判定中…</span>;
}

function CommentListRow({
  item,
  judgement,
  error,
  inFlight,
  onSelectComment,
  onResolve,
}: {
  item: CommentListItem;
  judgement: ResolveJudgementViewModel | null;
  error: string | null;
  inFlight: boolean;
  onSelectComment: (item: CommentListItem) => void;
  onResolve: () => Promise<void>;
}) {
  return (
    <div
      onClick={() => onSelectComment(item)}
      className="flex w-full cursor-pointer items-start gap-2 rounded-[5px] px-3 py-2 text-left transition-colors hover:bg-white/[0.045]"
    >
      {judgement ? <CommentRowDecisionDot decision={judgement.decision} /> : null}
      <span
        className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
        style={
          item.type === 'agent'
            ? { color: '#ffbf6b', background: '#1a1000' }
            : { color: '#58d7ff', background: '#001a22' }
        }
      >
        {item.type === 'agent' ? 'Agent' : 'Remote'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{item.title}</span>
          {item.publishedRemoteCount ? (
            <span className="shrink-0 rounded-full border border-[#4EBE96]/18 bg-[#4EBE96]/08 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#d7f5e8]/70">
              posted {item.publishedRemoteCount}
            </span>
          ) : null}
        </span>
        {item.filePath !== null || item.line !== null ? (
          <span className="mt-0.5 block truncate text-[10px] text-white/38">
            {item.filePath !== null ? (item.filePath.split('/').pop() ?? item.filePath) : null}
            {item.line !== null ? `:${String(item.line)}` : null}
          </span>
        ) : null}
        {error ? (
          <span className="mt-1 block text-[10px] leading-4 text-[#ffd0d0]">{error}</span>
        ) : null}
      </span>
      <ResolveThreadButton inFlight={inFlight} onClick={onResolve} />
    </div>
  );
}

async function resolveCommentItem({
  item,
  setInFlightKey,
  setNotice,
  setResolvedKeys,
  setErrorByKey,
  onThreadResolved,
}: {
  item: CommentListItem;
  setInFlightKey: (key: string | null) => void;
  setNotice: (notice: string | null) => void;
  setResolvedKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setErrorByKey: Dispatch<SetStateAction<Record<string, string>>>;
  onThreadResolved?: () => void;
}) {
  if (item.type === 'agent') {
    const result = await window.poc3GraphReviewApi.resolveAgentThread({
      reviewWorkspaceId: item.commentKey.reviewWorkspaceId,
      revisionId: item.commentKey.revisionId,
      localThreadId: item.commentKey.commentId,
    });
    setInFlightKey(null);
    if (result.ok) {
      if (result.remoteResults.some((remote) => remote.status === 'failed')) {
        setNotice('一部の Remote Comment を resolve できませんでした。');
      }
      markCommentResolved(item.key, setResolvedKeys);
      onThreadResolved?.();
    } else {
      setErrorByKey((current) => ({ ...current, [item.key]: result.message }));
    }
    return;
  }
  const result = await window.poc3GraphReviewApi.resolveRemoteThread({
    reviewWorkspaceId: item.commentKey.reviewWorkspaceId,
    revisionId: item.commentKey.revisionId,
    providerThreadId: item.commentKey.commentId,
  });
  setInFlightKey(null);
  if (result.ok) {
    markCommentResolved(item.key, setResolvedKeys);
    onThreadResolved?.();
    return;
  }
  if (result.reason === 'localPersistenceFailed') {
    setNotice(result.message);
    markCommentResolved(item.key, setResolvedKeys);
    return;
  }
  setErrorByKey((current) => ({ ...current, [item.key]: result.message }));
}

function markCommentResolved(
  key: string,
  setResolvedKeys: Dispatch<SetStateAction<ReadonlySet<string>>>,
) {
  setResolvedKeys((current) => {
    const next = new Set(current);
    next.add(key);
    return next;
  });
}

function CommentRowDecisionDot({ decision }: { decision: 'resolvable' | 'unresolvable' }) {
  const color = decision === 'resolvable' ? RESOLVABLE_COLOR : UNRESOLVABLE_COLOR;
  return (
    <span
      aria-label={decision === 'resolvable' ? 'Resolve可能' : 'Resolve不可'}
      className="mt-1.5 size-2 shrink-0 rounded-full"
      style={{
        background: color,
        boxShadow: `0 0 0 1px ${color}33, 0 0 6px ${color}55`,
      }}
    />
  );
}
