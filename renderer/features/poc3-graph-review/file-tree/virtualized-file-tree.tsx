'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import {
  flattenDiffFileTree,
  type DiffFileTreeItem,
  type VisibleTreeRow,
} from './build-diff-file-tree';

const ROW_HEIGHT = 24;
const OVERSCAN = 8;
const VIRTUALIZATION_THRESHOLD = 80;

interface VirtualizedFileTreeProps {
  id: string;
  items: DiffFileTreeItem[];
  defaultExpanded?: string[];
  onSelect?: (id: string, label: string) => void;
  renderAccessory?: (item: DiffFileTreeItem) => ReactNode;
  className?: string;
}

export function VirtualizedFileTree({
  id,
  items,
  defaultExpanded,
  onSelect,
  renderAccessory,
  className,
}: VirtualizedFileTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpanded ?? []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => flattenDiffFileTree(items, expandedIds), [items, expandedIds]);
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.item.id, index));
    return map;
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    enabled: rows.length >= VIRTUALIZATION_THRESHOLD,
  });

  useEffect(() => {
    const handleMouseDown = () => setKeyboardMode(false);
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const toggleExpanded = useCallback((rowId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (row: VisibleTreeRow) => {
      setSelectedId(row.item.id);
      setFocusedId(row.item.id);
      onSelect?.(row.item.id, row.item.name);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0) return;
      const currentIndex = focusedId != null ? (idToIndex.get(focusedId) ?? -1) : -1;

      const moveTo = (nextIndex: number) => {
        const clamped = Math.max(0, Math.min(rows.length - 1, nextIndex));
        const nextRow = rows[clamped];
        if (!nextRow) return;
        setKeyboardMode(true);
        setFocusedId(nextRow.item.id);
        if (rows.length >= VIRTUALIZATION_THRESHOLD) {
          virtualizer.scrollToIndex(clamped, { align: 'auto' });
        }
      };

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveTo(currentIndex < 0 ? 0 : currentIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveTo(currentIndex < 0 ? 0 : currentIndex - 1);
          break;
        case 'ArrowRight': {
          event.preventDefault();
          if (currentIndex < 0) return;
          const row = rows[currentIndex];
          if (row.hasChildren && !expandedIds.has(row.item.id)) {
            toggleExpanded(row.item.id);
          }
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          if (currentIndex < 0) return;
          const row = rows[currentIndex];
          if (row.hasChildren && expandedIds.has(row.item.id)) {
            toggleExpanded(row.item.id);
          }
          break;
        }
        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (currentIndex < 0) return;
          handleSelect(rows[currentIndex]);
          break;
        }
        default:
          break;
      }
    },
    [expandedIds, focusedId, handleSelect, idToIndex, rows, toggleExpanded, virtualizer],
  );

  const virtualEnabled = rows.length >= VIRTUALIZATION_THRESHOLD;
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualEnabled ? virtualizer.getTotalSize() : rows.length * ROW_HEIGHT;

  return (
    <div
      ref={scrollContainerRef}
      role="tree"
      aria-labelledby={`${id}-label`}
      tabIndex={0}
      data-poc3-virtualized-file-tree={virtualEnabled ? 'virtual' : 'static'}
      className={cn('relative h-full overflow-y-auto outline-none', className)}
      onKeyDown={handleKeyDown}
      onFocus={() => setKeyboardMode(true)}
      onBlur={(event) => {
        if (!scrollContainerRef.current?.contains(event.relatedTarget as Node | null)) {
          setKeyboardMode(false);
        }
      }}
    >
      {virtualEnabled ? (
        <div style={{ height: totalSize, position: 'relative' }}>
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <FileTreeRow
                key={row.item.id}
                row={row}
                expanded={expandedIds.has(row.item.id)}
                selected={selectedId === row.item.id}
                focused={focusedId === row.item.id && keyboardMode}
                onSelect={handleSelect}
                onToggleExpand={toggleExpanded}
                renderAccessory={renderAccessory}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  height: ROW_HEIGHT,
                }}
              />
            );
          })}
        </div>
      ) : (
        <div>
          {rows.map((row) => (
            <FileTreeRow
              key={row.item.id}
              row={row}
              expanded={expandedIds.has(row.item.id)}
              selected={selectedId === row.item.id}
              focused={focusedId === row.item.id && keyboardMode}
              onSelect={handleSelect}
              onToggleExpand={toggleExpanded}
              renderAccessory={renderAccessory}
              style={{ height: ROW_HEIGHT }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileTreeRowProps {
  row: VisibleTreeRow;
  expanded: boolean;
  selected: boolean;
  focused: boolean;
  onSelect: (row: VisibleTreeRow) => void;
  onToggleExpand: (id: string) => void;
  renderAccessory?: (item: DiffFileTreeItem) => ReactNode;
  style?: React.CSSProperties;
}

function FileTreeRow({
  row,
  expanded,
  selected,
  focused,
  onSelect,
  onToggleExpand,
  renderAccessory,
  style,
}: FileTreeRowProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (focused) {
      ref.current?.focus();
    }
  }, [focused]);

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      onSelect(row);
      if (row.hasChildren) {
        onToggleExpand(row.item.id);
      }
    },
    [onSelect, onToggleExpand, row],
  );

  const Icon = row.hasChildren ? (expanded ? FolderOpen : Folder) : File;

  return (
    <div
      ref={ref}
      data-id={row.item.id}
      role="treeitem"
      tabIndex={focused ? 0 : -1}
      aria-expanded={row.hasChildren ? expanded : undefined}
      aria-selected={selected}
      aria-level={row.level + 1}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'flex cursor-pointer select-none items-center gap-1.5 truncate rounded-sm text-xs transition-colors',
        selected
          ? 'border-r-2 border-[#d8e071]/50 bg-[#d8e071]/[0.1] text-[#d8e071]'
          : 'text-[#f2f2f2]/75 hover:bg-white/[0.06]',
        focused ? 'outline-none ring-1 ring-inset ring-[#d8e071]/50' : 'outline-none',
      )}
      style={{
        ...style,
        paddingLeft: 8 + row.level * 16,
        paddingRight: 8,
      }}
      onClick={handleClick}
    >
      {row.hasChildren ? (
        <ChevronRight
          size={12}
          className={cn(
            'shrink-0 text-white/40 transition-transform duration-150',
            expanded ? 'rotate-90' : 'rotate-0',
          )}
          aria-hidden="true"
        />
      ) : (
        <span className="w-3" aria-hidden="true" />
      )}
      <Icon
        size={14}
        className={cn(
          'shrink-0',
          selected ? 'text-[#d8e071]' : row.hasChildren ? 'text-white/55' : 'text-white/35',
        )}
        aria-hidden="true"
      />
      {renderAccessory ? (
        <span className="flex shrink-0 items-center">{renderAccessory(row.item)}</span>
      ) : null}
      <span className="flex-1 truncate">{row.item.name}</span>
    </div>
  );
}
