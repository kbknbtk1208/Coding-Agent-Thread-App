'use client';

import {
  AnimatePresence,
  motion,
  MotionConfig,
  useDragControls,
  useMotionValue,
} from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import { useCommentList } from './use-comment-list';

const EASE = [0.4, 0, 0.2, 1] as const;

interface CommentListDockProps {
  graph: GraphRenderSnapshot;
  reviewWorkspaceId: string;
  onSelectNode: (nodeId: string) => void;
}

export function CommentListDock({ graph, reviewWorkspaceId, onSelectNode }: CommentListDockProps) {
  const items = useCommentList(graph, reviewWorkspaceId);
  const [open, setOpen] = useState(false);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDraggingRef = useRef(false);

  if (items.length === 0) return null;

  const agentCount = items.filter((i) => i.type === 'agent').length;
  const remoteCount = items.filter((i) => i.type === 'remote').length;

  const headerLabel = open
    ? 'Comments'
    : [
        agentCount > 0 ? `${agentCount} Agent Thread` : null,
        remoteCount > 0 ? `${remoteCount} Remote Comment` : null,
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
        <button
          type="button"
          className="flex w-full cursor-grab items-center gap-2 rounded-[5px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045] active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
          onClick={() => {
            if (!isDraggingRef.current) setOpen((prev) => !prev);
          }}
          aria-expanded={open}
        >
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/72">
            {headerLabel}
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown className="size-4 shrink-0 text-white/54" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="comment-list"
              initial={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8 }}
              animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, height: 0, filter: 'blur(18px)', y: -8 }}
              transition={{ duration: 0.5, ease: EASE, height: { duration: 0.5, ease: EASE } }}
              className="origin-top overflow-hidden border-t border-white/[0.06]"
            >
              <div className="max-h-[400px] overflow-y-auto py-1">
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelectNode(item.nodeId)}
                    className="flex w-full cursor-pointer items-start gap-2 rounded-[5px] px-3 py-2 text-left transition-colors hover:bg-white/[0.045]"
                  >
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
                      <span className="block truncate text-[12px] text-white/80">{item.title}</span>
                      {item.filePath !== null || item.line !== null ? (
                        <span className="mt-0.5 block truncate text-[10px] text-white/38">
                          {item.filePath !== null
                            ? (item.filePath.split('/').pop() ?? item.filePath)
                            : null}
                          {item.line !== null ? `:${item.line}` : null}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}
