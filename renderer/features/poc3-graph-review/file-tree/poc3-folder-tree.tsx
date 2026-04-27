'use client';
import React, { useState, useCallback, createContext, useContext, useRef, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { ChevronRight, Folder, FolderOpen, File, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONTENT_EASE = [0.4, 0, 0.2, 1] as const;

const animationVariants: Variants = {
  rootInitial: { opacity: 0, y: 12 },
  rootAnimate: { opacity: 1, y: 0 },
  itemInitial: { opacity: 0, x: -8 },
  itemAnimate: { opacity: 1, x: 0 },
  chevronClosed: { rotate: 0 },
  chevronOpen: { rotate: 90 },
};

const transitions = {
  root: { duration: 0.35 },
  item: { duration: 0.18 },
  chevron: { duration: 0.2 },
};

interface ExpansionContextType {
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

interface SelectionContextType {
  selectedId: string | null;
  setSelected: (id: string) => void;
  onSelect?: (id: string, label: string) => void;
}

interface TreeContextType {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  treeId: string;
  setKeyboardMode: (mode: boolean) => void;
  keyboardMode: boolean;
}

interface LevelContextType {
  level: number;
}

const ExpansionContext = createContext<ExpansionContextType | null>(null);
const SelectionContext = createContext<SelectionContextType | null>(null);
const TreeContext = createContext<TreeContextType | null>(null);
const LevelContext = createContext<LevelContextType>({ level: 0 });

const useExpansion = () => {
  const context = useContext(ExpansionContext);
  if (!context)
    throw new Error('Poc3FolderTree components must be used within Poc3FolderTree.Root');
  return context;
};

const useSelection = () => {
  const context = useContext(SelectionContext);
  if (!context)
    throw new Error('Poc3FolderTree components must be used within Poc3FolderTree.Root');
  return context;
};

const useTree = () => {
  const context = useContext(TreeContext);
  if (!context)
    throw new Error('Poc3FolderTree components must be used within Poc3FolderTree.Root');
  return context;
};

const useLevel = () => useContext(LevelContext);

const getPaddingClass = (level: number): string => {
  const paddingMap: Record<number, string> = {
    0: 'pl-2',
    1: 'pl-6',
    2: 'pl-10',
    3: 'pl-14',
    4: 'pl-20',
    5: 'pl-24',
    6: 'pl-28',
    7: 'pl-32',
    8: 'pl-36',
  };
  return paddingMap[level] ?? 'pl-36';
};

interface RootProps {
  defaultExpanded?: string[];
  defaultSelected?: string;
  onSelect?: (id: string, label: string) => void;
  className?: string;
  children: React.ReactNode;
  id?: string;
}

interface ItemProps {
  id: string;
  label: string;
  icon?: LucideIcon;
  className?: string;
  children?: React.ReactNode;
}

interface ContentProps {
  children: React.ReactNode;
  className?: string;
}

const Root: React.FC<RootProps> = ({
  defaultExpanded = [],
  defaultSelected,
  onSelect,
  className = '',
  children,
  id = 'poc3-folder-tree',
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(defaultExpanded));
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelected ?? null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const setSelected = useCallback((itemId: string) => {
    setSelectedId(itemId);
  }, []);

  const getVisibleItemIds = useCallback(() => {
    return Array.from(treeRef.current?.querySelectorAll('[role="treeitem"]') ?? [])
      .filter((el) => {
        const e = el as HTMLElement;
        return e.offsetHeight > 0 && e.offsetWidth > 0;
      })
      .map((el) => el.getAttribute('data-id'))
      .filter((v): v is string => v !== null);
  }, []);

  const [treeHasFocus, setTreeHasFocus] = useState(false);

  const handleTreeFocus = useCallback(() => {
    if (!treeHasFocus) {
      setTreeHasFocus(true);
      setKeyboardMode(true);
    }
  }, [treeHasFocus]);

  const handleTreeBlur = useCallback((e: React.FocusEvent) => {
    if (!treeRef.current?.contains(e.relatedTarget as Node)) {
      setTreeHasFocus(false);
      setFocusedId(null);
      setKeyboardMode(false);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const getVisibleItems = () =>
        Array.from(treeRef.current?.querySelectorAll('[role="treeitem"]') ?? []).filter((el) => {
          const elem = el as HTMLElement;
          return elem.offsetHeight > 0 && elem.offsetWidth > 0;
        });

      if (e.key === 'Tab') {
        if (treeHasFocus && !focusedId) {
          const ids = getVisibleItemIds();
          if (ids.length > 0) {
            setFocusedId(ids[0]);
            e.preventDefault();
            return;
          }
        }
        if (focusedId) {
          const items = getVisibleItems();
          const idx = items.findIndex((el) => el.getAttribute('data-id') === focusedId);
          if (e.shiftKey) {
            if (idx === 0) {
              setFocusedId(null);
              setTreeHasFocus(false);
              setKeyboardMode(false);
              return;
            }
            const next = items[Math.max(0, idx - 1)] as HTMLElement;
            const nextId = next?.getAttribute('data-id');
            if (nextId) {
              setFocusedId(nextId);
              e.preventDefault();
            }
          } else {
            if (idx === items.length - 1) {
              setFocusedId(null);
              setTreeHasFocus(false);
              setKeyboardMode(false);
              return;
            }
            const next = items[Math.min(items.length - 1, idx + 1)] as HTMLElement;
            const nextId = next?.getAttribute('data-id');
            if (nextId) {
              setFocusedId(nextId);
              e.preventDefault();
            }
          }
        }
        return;
      }

      if (!keyboardMode || !focusedId) return;

      const items = getVisibleItems();
      const idx = items.findIndex((el) => el.getAttribute('data-id') === focusedId);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (idx < items.length - 1) {
            const nextId = (items[idx + 1] as HTMLElement).getAttribute('data-id');
            if (nextId) setFocusedId(nextId);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (idx > 0) {
            const prevId = (items[idx - 1] as HTMLElement).getAttribute('data-id');
            if (prevId) setFocusedId(prevId);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!expandedIds.has(focusedId)) toggleExpanded(focusedId);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (expandedIds.has(focusedId)) toggleExpanded(focusedId);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          setSelected(focusedId);
          if (onSelect) {
            const label =
              (items[idx] as HTMLElement).querySelector('span:nth-of-type(2)')?.textContent ?? '';
            onSelect(focusedId, label);
          }
          break;
      }
    },
    [
      focusedId,
      keyboardMode,
      expandedIds,
      toggleExpanded,
      setSelected,
      onSelect,
      getVisibleItemIds,
      treeHasFocus,
    ],
  );

  useEffect(() => {
    const handleMouseDown = () => setKeyboardMode(false);
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  return (
    <ExpansionContext.Provider value={{ expandedIds, toggleExpanded }}>
      <SelectionContext.Provider value={{ selectedId, setSelected, onSelect }}>
        <TreeContext.Provider
          value={{ focusedId, setFocusedId, treeId: id, setKeyboardMode, keyboardMode }}
        >
          <LevelContext.Provider value={{ level: 0 }}>
            <motion.div
              ref={treeRef}
              variants={animationVariants}
              initial="rootInitial"
              animate="rootAnimate"
              transition={transitions.root}
              className={cn('bg-transparent text-sm', className)}
              role="tree"
              aria-labelledby={`${id}-label`}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onFocus={handleTreeFocus}
              onBlur={handleTreeBlur}
            >
              <div className="w-full">{children}</div>
            </motion.div>
          </LevelContext.Provider>
        </TreeContext.Provider>
      </SelectionContext.Provider>
    </ExpansionContext.Provider>
  );
};

const ItemContext = createContext<{
  itemId: string;
  hasChildren: boolean;
  isExpanded: boolean;
  toggleExpanded: () => void;
} | null>(null);

const Item: React.FC<ItemProps> = ({ id, label, icon, className = '', children }) => {
  const expansionContext = useExpansion();
  const selectionContext = useSelection();
  const treeContext = useTree();
  const { level } = useLevel();
  const itemRef = useRef<HTMLDivElement>(null);

  const hasChildren = React.Children.count(children) > 0;
  const isExpanded = expansionContext.expandedIds.has(id);
  const isSelected = selectionContext.selectedId === id;
  const isFocused = treeContext.focusedId === id;

  const handleItemClick = useCallback(() => {
    treeContext.setKeyboardMode(false);
    selectionContext.setSelected(id);
    treeContext.setFocusedId(id);
    if (selectionContext.onSelect) selectionContext.onSelect(id, label);
  }, [id, label, selectionContext, treeContext]);

  const toggleExpanded = useCallback(() => {
    if (hasChildren) expansionContext.toggleExpanded(id);
  }, [id, hasChildren, expansionContext]);

  const handleFocus = useCallback(() => treeContext.setFocusedId(id), [id, treeContext]);

  useEffect(() => {
    if (isFocused && itemRef.current) itemRef.current.focus();
  }, [isFocused]);

  const IconComponent = icon ?? (hasChildren ? (isExpanded ? FolderOpen : Folder) : File);

  return (
    <ItemContext.Provider value={{ itemId: id, hasChildren, isExpanded, toggleExpanded }}>
      <LevelContext.Provider value={{ level: level + 1 }}>
        <div>
          <motion.div
            ref={itemRef}
            variants={animationVariants}
            initial="itemInitial"
            animate="itemAnimate"
            transition={{ ...transitions.item, delay: level * 0.04 }}
            data-selected={isSelected ? 'true' : 'false'}
            data-id={id}
            className={cn(
              'flex items-center gap-1.5 py-1 text-xs transition-colors cursor-pointer select-none rounded-sm',
              getPaddingClass(level),
              className,
              isSelected
                ? 'bg-[#d8e071]/[0.1] text-[#d8e071] border-r-2 border-[#d8e071]/50'
                : 'text-[#f2f2f2]/75 hover:bg-white/[0.06]',
              treeContext.keyboardMode && isFocused
                ? 'outline-none ring-1 ring-inset ring-[#d8e071]/50'
                : 'outline-none',
            )}
            onClick={(e: React.MouseEvent) => {
              handleItemClick();
              e.stopPropagation();
              toggleExpanded();
            }}
            onFocus={handleFocus}
            role="treeitem"
            tabIndex={isFocused ? 0 : -1}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isSelected}
            aria-label={`${hasChildren ? 'Folder' : 'File'}: ${label}`}
            aria-level={level + 1}
          >
            {hasChildren ? (
              <motion.span
                className="shrink-0"
                variants={animationVariants}
                animate={isExpanded ? 'chevronOpen' : 'chevronClosed'}
                transition={transitions.chevron}
                aria-hidden="true"
              >
                <ChevronRight size={12} className="text-white/40" />
              </motion.span>
            ) : (
              <span className="w-3" aria-hidden="true" />
            )}
            <IconComponent
              size={14}
              data-selected={isSelected ? 'true' : 'false'}
              data-child={hasChildren ? 'true' : 'false'}
              className={cn(
                'shrink-0',
                isSelected ? 'text-[#d8e071]' : hasChildren ? 'text-white/55' : 'text-white/35',
              )}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{label}</span>
          </motion.div>
          {children}
        </div>
      </LevelContext.Provider>
    </ItemContext.Provider>
  );
};

const Content: React.FC<ContentProps> = ({ children, className = '' }) => {
  const itemContext = useContext(ItemContext);
  if (!itemContext) return <>{children}</>;

  const hasContent = React.Children.count(children) > 0;

  return (
    <AnimatePresence>
      {hasContent && itemContext.isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0, filter: 'blur(8px)', y: -4 }}
          animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, height: 0, filter: 'blur(8px)', y: -4 }}
          transition={{ duration: 0.35, ease: CONTENT_EASE }}
          style={{ overflow: 'hidden' }}
          className={className}
          role="group"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const Poc3FolderTree = {
  Root,
  Item,
  Content,
};
