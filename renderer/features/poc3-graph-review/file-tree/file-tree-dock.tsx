'use client';

import { Files, X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls, useMotionValue } from 'motion/react';
import { useCallback, useRef } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import {
  DOCK_GLASS_STYLE,
  DOCK_SHEEN_STYLE,
  useDockAnimationStage,
} from '../components/use-dock-animation-stage';
import {
  buildDiffFileTree,
  collectDefaultExpanded,
  type DiffFileTreeItem,
} from './build-diff-file-tree';
import { Poc3FolderTree } from './poc3-folder-tree';

const DOCK_WIDTH = 272;
const DOCK_HEIGHT = 'min(72vh, 480px)';
const TRIGGER_WIDTH = 120;
const TRIGGER_HEIGHT = 40;

interface FileTreeDockProps {
  graph: GraphRenderSnapshot;
  onFileSelect?: (filePath: string) => void;
}

export function FileTreeDock({ graph, onFileSelect }: FileTreeDockProps) {
  const { stage, isCollapsed, isExpanded, expand, collapse } = useDockAnimationStage();
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDraggingRef = useRef(false);

  const treeItems = buildDiffFileTree(graph.nodes);
  if (treeItems.length === 0) return null;

  const defaultExpanded = collectDefaultExpanded(treeItems);

  const handleTreeSelect = useCallback(
    (id: string) => {
      const found = findItem(treeItems, id);
      if (found?.kind === 'file') {
        onFileSelect?.(found.path);
      }
    },
    [treeItems, onFileSelect],
  );

  const widthValue =
    stage === 'collapsed' || stage === 'widthCollapsing' ? TRIGGER_WIDTH : DOCK_WIDTH;

  const heightValue =
    stage === 'collapsed' || stage === 'widthExpanding' || stage === 'widthCollapsing'
      ? TRIGGER_HEIGHT
      : DOCK_HEIGHT;

  return (
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
      className="fixed left-[364px] top-4 z-30 overflow-hidden"
      initial={{ width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT }}
      animate={{ width: widthValue, height: heightValue }}
      transition={{
        width: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
        height: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
      }}
      style={{ ...DOCK_GLASS_STYLE, x, y }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={DOCK_SHEEN_STYLE}
      />

      {/* header — drag handle, always rendered */}
      <div
        className={`relative z-10 flex h-10 shrink-0 items-center gap-2 px-2.5 ${isCollapsed ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={(e) => dragControls.start(e)}
        onClick={() => {
          if (isCollapsed && !isDraggingRef.current) expand();
        }}
        role={isCollapsed ? 'button' : undefined}
        aria-label={isCollapsed ? 'File Tree を開く' : undefined}
        tabIndex={isCollapsed ? 0 : undefined}
        onKeyDown={
          isCollapsed
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  expand();
                }
              }
            : undefined
        }
      >
        <Files size={15} className="shrink-0 text-white/55" aria-hidden="true" />
        <span className="whitespace-nowrap text-[11px] font-medium tracking-wide text-white/60">
          File Tree
        </span>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              key="close-btn"
              className="ml-auto flex shrink-0 items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: isExpanded ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  collapse();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex size-5 cursor-pointer items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                aria-label="File Tree を閉じる"
              >
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* separator */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            key="separator"
            initial={{ opacity: 0 }}
            animate={{ opacity: isExpanded ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 mx-2.5 h-px shrink-0 bg-white/[0.06]"
          />
        )}
      </AnimatePresence>

      {/* tree content */}
      <motion.div
        className="relative z-10 flex-1 overflow-hidden"
        animate={{ opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      >
        <div
          className="overflow-y-auto py-1.5"
          style={{ maxHeight: `calc(${DOCK_HEIGHT} - 44px)` }}
        >
          <Poc3FolderTree.Root
            id="file-tree-dock"
            defaultExpanded={defaultExpanded}
            onSelect={handleTreeSelect}
          >
            {renderItems(treeItems)}
          </Poc3FolderTree.Root>
        </div>
      </motion.div>
    </motion.div>
  );
}

function findItem(items: DiffFileTreeItem[], id: string): DiffFileTreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.kind === 'dir') {
      const found = findItem(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function renderItems(items: DiffFileTreeItem[]) {
  return items.map((item) => {
    if (item.kind === 'file') {
      return <Poc3FolderTree.Item key={item.id} id={item.id} label={item.name} />;
    }
    return (
      <Poc3FolderTree.Item key={item.id} id={item.id} label={item.name}>
        {item.children.length > 0 && (
          <Poc3FolderTree.Content>{renderItems(item.children)}</Poc3FolderTree.Content>
        )}
      </Poc3FolderTree.Item>
    );
  });
}
