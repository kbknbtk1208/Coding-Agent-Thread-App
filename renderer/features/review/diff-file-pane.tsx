import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { DiffView, DiffModeEnum, SplitSide } from '@git-diff-view/react';
import type { DiffFile } from '@git-diff-view/react';
import { generateDiffFile } from '@git-diff-view/file';
import type { NormalizedDiffFile, ReviewThread } from '../../../shared/domain/review';
import { ThreadLayer } from './thread-layer';
import { CommentComposer } from './comment-composer';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Number of context lines shown around each hunk on initial render.
 * The library default is Infinity (show all context). Using a small value
 * reduces visual noise and lets the user expand non-diff regions on demand
 * via the built-in hunk expand buttons (up / down / expand-all arrows).
 */
const INITIAL_CONTEXT_LINES = 3;

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface DiffFilePaneProps {
  file: NormalizedDiffFile;
  onAddComment: (
    fileId: string,
    startLine: number | null,
    endLine: number,
    side: SplitSide,
    body: string,
  ) => void;
  onReply: (threadId: string, body: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Range selection state                                              */
/* ------------------------------------------------------------------ */

interface RangeSelectionState {
  side: SplitSide;
  startLine: number;
  endLine: number;
  status: 'selecting' | 'composing';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getChangeTypeLabel(changeType: NormalizedDiffFile['changeType']): string {
  switch (changeType) {
    case 'added':
      return 'Added';
    case 'deleted':
      return 'Deleted';
    case 'renamed':
      return 'Renamed';
    case 'modified':
      return 'Modified';
  }
}

function getChangeTypeBadgeClass(changeType: NormalizedDiffFile['changeType']): string {
  switch (changeType) {
    case 'added':
      return 'bg-green-500/20 text-green-400';
    case 'deleted':
      return 'bg-red-500/20 text-red-400';
    case 'renamed':
      return 'bg-blue-500/20 text-blue-400';
    case 'modified':
      return 'bg-yellow-500/20 text-yellow-400';
  }
}

function buildExtendData(threads: ReviewThread[]): {
  oldFile: Record<string, { data: ReviewThread[] }>;
  newFile: Record<string, { data: ReviewThread[] }>;
} {
  const oldFile: Record<string, { data: ReviewThread[] }> = {};
  const newFile: Record<string, { data: ReviewThread[] }> = {};

  for (const thread of threads) {
    const lineNumber = thread.anchor.endLine;
    if (lineNumber === null) continue;

    const key = String(lineNumber);
    const target = thread.anchor.side === 'old' ? oldFile : newFile;

    if (target[key]) {
      target[key].data.push(thread);
    } else {
      target[key] = { data: [thread] };
    }
  }

  return { oldFile, newFile };
}

/**
 * Convert an anchor side string ('old' | 'new') to the CSS data-side attribute value.
 * Centralises the mapping so we don't scatter string-to-string conversions throughout
 * highlight generation code.
 */
function anchorSideToDataAttr(side: 'old' | 'new'): string {
  return side;
}

/**
 * Convert a SplitSide enum value to the CSS data-side attribute string.
 */
function splitSideToDataAttr(side: SplitSide): string {
  return side === SplitSide.old ? 'old' : 'new';
}

/**
 * Walk up the DOM tree from the given element to find a `<tr data-line data-side>`
 * rendered by @git-diff-view/react. Returns the numeric line number and the
 * SplitSide, or null if the element is outside a content row.
 *
 * Fix #7: Validates that data-side is explicitly 'old' or 'new' before accepting.
 */
function extractLineInfo(
  target: EventTarget | null,
): { lineNumber: number; side: SplitSide } | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el) {
    const lineAttr = el.getAttribute('data-line');
    const sideAttr = el.getAttribute('data-side');
    const stateAttr = el.getAttribute('data-state');

    // Only content rows (diff / plain) are valid — skip widget, extend, hunk
    if (lineAttr && sideAttr && (stateAttr === 'diff' || stateAttr === 'plain')) {
      // Fix #7: only accept known side values
      if (sideAttr !== 'old' && sideAttr !== 'new') return null;

      const parsed = Number(lineAttr);
      if (!Number.isNaN(parsed) && parsed > 0) {
        const side = sideAttr === 'old' ? SplitSide.old : SplitSide.new;
        return { lineNumber: parsed, side };
      }
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Resolve the element at the given pointer coordinates using
 * document.elementFromPoint, then delegate to extractLineInfo.
 * This avoids issues with setPointerCapture redirecting e.target.
 */
function extractLineInfoFromPoint(
  clientX: number,
  clientY: number,
): { lineNumber: number; side: SplitSide } | null {
  const el = document.elementFromPoint(clientX, clientY);
  return extractLineInfo(el);
}

/**
 * Given two raw drag positions, return the normalized (min, max) pair.
 */
function normalizeRange(a: number, b: number): { start: number; end: number } {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/* ------------------------------------------------------------------ */
/*  Scroll anchor helpers (§4.8)                                       */
/* ------------------------------------------------------------------ */

/**
 * Find the nearest scrollable ancestor of `el` by walking up the DOM.
 * Returns null if no scrollable parent is found (unlikely in practice).
 */
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let current = el?.parentElement ?? null;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Snapshot the position of a visible "anchor row" inside the wrapper
 * relative to the scroll container viewport. After a DOM mutation that
 * changes content height (e.g. hunk expand / collapse), restoring the
 * snapshot keeps the anchor row at the same visual position, preventing
 * a jarring scroll jump.
 */
interface ScrollAnchorSnapshot {
  /** The anchor row element whose position we lock. */
  anchorRow: HTMLElement;
  /** Distance from the anchor row's top to the scroll container viewport top. */
  offsetFromViewport: number;
}

/**
 * Find the first visible `<tr>` row inside `wrapper` that intersects
 * the scroll container's viewport. This becomes our scroll anchor.
 */
function captureScrollAnchor(
  wrapper: HTMLElement,
  scrollContainer: HTMLElement,
): ScrollAnchorSnapshot | null {
  const rows = wrapper.querySelectorAll<HTMLElement>('tr.diff-line');
  if (rows.length === 0) return null;

  const containerRect = scrollContainer.getBoundingClientRect();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowRect = row.getBoundingClientRect();
    // The row is "visible" when its top is within the viewport
    if (rowRect.top >= containerRect.top && rowRect.top < containerRect.bottom) {
      return {
        anchorRow: row,
        offsetFromViewport: rowRect.top - containerRect.top,
      };
    }
  }

  // Fallback: use the first row
  const firstRow = rows[0];
  const firstRowRect = firstRow.getBoundingClientRect();
  return {
    anchorRow: firstRow,
    offsetFromViewport: firstRowRect.top - containerRect.top,
  };
}

/**
 * Restore scroll position so the anchor row stays at the same visual offset.
 */
function restoreScrollAnchor(scrollContainer: HTMLElement, snapshot: ScrollAnchorSnapshot): void {
  const rowRect = snapshot.anchorRow.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const currentOffset = rowRect.top - containerRect.top;
  const delta = currentOffset - snapshot.offsetFromViewport;
  if (Math.abs(delta) > 1) {
    scrollContainer.scrollTop += delta;
  }
}

/**
 * Custom hook: wraps a DOM-mutating callback with automatic scroll
 * anchor save / restore. The caller passes a ref to the wrapper element
 * so the hook can find anchor rows and the scroll container.
 */
function useScrollAnchor(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const snapshotRef = useRef<{
    snapshot: ScrollAnchorSnapshot;
    scrollContainer: HTMLElement;
  } | null>(null);

  /** Call BEFORE the mutation (e.g. before expanding all hunks). */
  const saveAnchor = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scrollContainer = findScrollContainer(wrapper);
    if (!scrollContainer) return;
    const snapshot = captureScrollAnchor(wrapper, scrollContainer);
    if (snapshot) {
      snapshotRef.current = { snapshot, scrollContainer };
    }
  }, [wrapperRef]);

  /** Call AFTER the mutation via useLayoutEffect or requestAnimationFrame. */
  const restoreAnchor = useCallback(() => {
    const saved = snapshotRef.current;
    if (!saved) return;
    snapshotRef.current = null;
    restoreScrollAnchor(saved.scrollContainer, saved.snapshot);
  }, []);

  return { saveAnchor, restoreAnchor };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DiffFilePane({ file, onAddComment, onReply }: DiffFilePaneProps) {
  const [expanded, setExpanded] = useState(!file.isLargeDiff);

  /**
   * §4.8 (objective 4): rangeSelection is scoped to this component instance.
   * Each DiffFilePane manages its own selection independently, so pointer-move
   * hover redraws during range selection only trigger re-renders in the file
   * being selected — other file panes are unaffected. The highlightStyle memo
   * below further ensures CSS recalculations are bounded to the active file.
   */
  const [rangeSelection, setRangeSelection] = useState<RangeSelectionState | null>(null);

  /* Keep a mutable ref for the raw drag anchor so pointer-move reads the
     latest value without re-rendering on every move event. */
  const dragAnchorRef = useRef<{ side: SplitSide; anchorLine: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /**
   * When true, the ResizeObserver callback skips its own scroll anchor
   * restore because handleToggleExpandAll is already performing one.
   * This prevents double-restoration (the explicit restoreAnchor() call
   * in the rAF callback AND the ResizeObserver seeing the height change).
   */
  const skipResizeRestore = useRef(false);

  /* ------ §4.8 Scroll anchor (Expand All / individual hunk) ------ */
  const { saveAnchor, restoreAnchor } = useScrollAnchor(wrapperRef);

  /* ------ extend data (threads + composing) ------ */

  /**
   * Fix #2: Collect file-level threads (endLine === null) separately.
   * These are not attached to any diff line and will be rendered above the diff view.
   */
  const fileLevelThreads = useMemo(
    () => file.threads.filter((t) => t.anchor.endLine === null),
    [file.threads],
  );

  const threadExtendData = useMemo(() => buildExtendData(file.threads), [file.threads]);

  const extendData = useMemo(() => {
    if (!rangeSelection || rangeSelection.status !== 'composing') return threadExtendData;

    const normalized = normalizeRange(rangeSelection.startLine, rangeSelection.endLine);
    const key = String(normalized.end);
    const sideKey = rangeSelection.side === SplitSide.old ? 'oldFile' : 'newFile';

    // Deep-clone the side bucket so we don't mutate the thread data
    const clonedSide = { ...threadExtendData[sideKey] };
    const existing = clonedSide[key];
    if (existing) {
      // Append a sentinel "composing" marker — the renderer checks for it
      clonedSide[key] = { data: [...existing.data] };
    } else {
      clonedSide[key] = { data: [] };
    }

    // We use the composing marker by always rendering the composer at the
    // endLine via renderExtendLine; see the renderExtendLine callback below.
    return {
      ...threadExtendData,
      [sideKey]: clonedSide,
    };
  }, [threadExtendData, rangeSelection]);

  /* ------ Render callbacks ------ */

  const renderExtendLine = useCallback(
    ({
      data,
      lineNumber,
      side,
    }: {
      data?: ReviewThread[];
      lineNumber: number;
      side: SplitSide;
    }) => {
      const elements: React.ReactNode[] = [];

      // Existing threads — data may be undefined when the library calls
      // renderExtendLine for lines not present in extendData
      if (data && data.length > 0) {
        elements.push(<ThreadLayer key="threads" threads={data} onReply={onReply} />);
      }

      // Range composer
      if (rangeSelection && rangeSelection.status === 'composing' && rangeSelection.side === side) {
        const { start, end } = normalizeRange(rangeSelection.startLine, rangeSelection.endLine);
        if (lineNumber === end) {
          elements.push(
            <CommentComposer
              key="range-composer"
              startLine={start}
              endLine={end}
              side={side}
              onSubmit={(body) => {
                onAddComment(file.fileId, start, end, side, body);
                setRangeSelection(null);
              }}
              onClose={() => setRangeSelection(null)}
            />,
          );
        }
      }

      if (elements.length === 0) return null;
      return <>{elements}</>;
    },
    [onReply, rangeSelection, file.fileId, onAddComment],
  );

  const renderWidgetLine = useCallback(
    ({
      lineNumber,
      side,
      onClose,
    }: {
      lineNumber: number;
      side: SplitSide;
      diffFile: DiffFile;
      onClose: () => void;
    }) => {
      return (
        <CommentComposer
          startLine={null}
          endLine={lineNumber}
          side={side}
          onSubmit={(body) => onAddComment(file.fileId, null, lineNumber, side, body)}
          onClose={onClose}
        />
      );
    },
    [file.fileId, onAddComment],
  );

  /* ------ Pointer event handlers (event delegation) ------ */

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Fix #1: use elementFromPoint instead of e.target (avoids setPointerCapture issues)
    const info = extractLineInfoFromPoint(e.clientX, e.clientY);
    if (!info) return;

    // Only respond to primary button (left click)
    if (e.button !== 0) return;

    // Fix #4: prevent text selection during drag
    e.preventDefault();

    dragAnchorRef.current = { side: info.side, anchorLine: info.lineNumber };
    setRangeSelection({
      side: info.side,
      startLine: info.lineNumber,
      endLine: info.lineNumber,
      status: 'selecting',
    });

    // Fix #1: removed setPointerCapture — elementFromPoint handles coordinate lookup
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;

    // Fix #1: use elementFromPoint instead of e.target
    const info = extractLineInfoFromPoint(e.clientX, e.clientY);
    if (!info) return;

    // Only update if on the same side
    if (info.side !== anchor.side) return;

    const { start, end } = normalizeRange(anchor.anchorLine, info.lineNumber);
    setRangeSelection((prev) => {
      if (!prev || prev.status !== 'selecting') return prev;
      if (prev.startLine === start && prev.endLine === end) return prev;
      return { ...prev, startLine: start, endLine: end };
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;

    dragAnchorRef.current = null;

    // Fix #1: use elementFromPoint for final position detection
    const info = extractLineInfoFromPoint(e.clientX, e.clientY);

    setRangeSelection((prev) => {
      if (!prev || prev.status !== 'selecting') return null;

      // If pointer ended on a valid line on the same side, use that as the final end
      const finalEnd = info && info.side === prev.side ? info.lineNumber : prev.endLine;
      const { start, end } = normalizeRange(prev.startLine, finalEnd);

      if (start === end) {
        // Single line — let the library's built-in + button / renderWidgetLine handle it
        return null;
      }
      // Multi-line range -> open composer
      return { side: prev.side, startLine: start, endLine: end, status: 'composing' };
    });
  }, []);

  /* ------ Selection highlight CSS ------ */

  /**
   * Fix #8: Instead of generating one CSS selector per line, we use data attributes
   * on the wrapper div (data-range-start, data-range-end, data-range-side) and
   * a single CSS rule with a :where() selector. The wrapper attributes are updated
   * via React state changes, and the CSS rule matches all rows within the range
   * using the general sibling combinator approach. Since CSS cannot do numeric
   * range matching on attributes, we still generate per-line selectors but memoize
   * them based on the computed (start, end, side, status) tuple to avoid
   * unnecessary recalculations during drag.
   */
  const rangeStart = rangeSelection
    ? Math.min(rangeSelection.startLine, rangeSelection.endLine)
    : 0;
  const rangeEnd = rangeSelection ? Math.max(rangeSelection.startLine, rangeSelection.endLine) : 0;
  const rangeSide = rangeSelection?.side ?? null;
  const rangeStatus = rangeSelection?.status ?? null;

  /**
   * §4.8 (objective 4): CSS selectors are scoped to `[data-file-id="<fileId>"]`
   * so that highlight rule changes in one file pane do not trigger style
   * recalculation on other file panes in the document.
   */
  const highlightStyle = useMemo(() => {
    const rules: string[] = [];
    const scope = `[data-file-id="${CSS.escape(file.fileId)}"]`;

    // 1. Existing range thread highlights (subtle)
    for (const thread of file.threads) {
      if (thread.anchor.kind !== 'range') continue;
      const start = thread.anchor.startLine;
      const end = thread.anchor.endLine;
      if (start === null || end === null) continue;
      const sideStr = anchorSideToDataAttr(thread.anchor.side);
      const selectors: string[] = [];
      for (let ln = start; ln <= end; ln++) {
        selectors.push(`${scope} tr.diff-line[data-side="${sideStr}"][data-line="${ln}"] td`);
      }
      if (selectors.length > 0) {
        rules.push(
          `${selectors.join(',\n')} { background-color: rgba(103, 232, 249, 0.06) !important; }`,
        );
      }
    }

    // 2. Active range selection highlight (composing or selecting)
    // Note: rangeStart === rangeEnd && rangeStatus === 'composing' cannot occur here because
    // handlePointerUp returns null (cancels selection) when start === end, so only multi-line
    // ranges ever reach the 'composing' status.
    //
    // IMPORTANT: CSS rule ordering matters — existing thread highlights (step 1) are emitted
    // first, followed by the active selection highlight (step 2). Both use !important, so
    // the later rule wins by source order, ensuring the composing/selecting highlight visually
    // overrides the subtler thread background.
    if (rangeSide && rangeStart > 0 && !(rangeStart === rangeEnd && rangeStatus === 'selecting')) {
      const sideStr = splitSideToDataAttr(rangeSide);
      const selectors: string[] = [];
      for (let ln = rangeStart; ln <= rangeEnd; ln++) {
        selectors.push(`${scope} tr.diff-line[data-side="${sideStr}"][data-line="${ln}"] td`);
      }
      if (selectors.length > 0) {
        rules.push(
          `${selectors.join(',\n')} { background-color: rgba(103, 232, 249, 0.12) !important; }`,
        );
      }
    }

    return rules.join('\n');
  }, [file.fileId, file.threads, rangeStart, rangeEnd, rangeSide, rangeStatus]);

  /* ------ Cancel selection on outside clicks ------ */

  // Fix #5: depend only on rangeStatus to avoid re-registering on every drag move
  useEffect(() => {
    if (rangeStatus !== 'composing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRangeSelection(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rangeStatus]);

  /* ------ Build diff file instance ------ */

  /**
   * IMPORTANT (§4.8 Scroll-jitter prevention):
   * The dependency array intentionally excludes `file.threads`.
   * Adding/replying to threads must NOT cause the DiffFile instance to be
   * regenerated — doing so would destroy the internal expand/collapse state
   * and cause the entire diff table to re-mount, producing a visible scroll
   * jump. Thread data flows through `extendData` and the `renderExtendLine`
   * callback instead, which update only the thread layer rows without
   * touching the diff body.
   *
   * The key is effectively: fileId + content hash (oldContent + newContent +
   * language + paths). Only a genuine content change triggers regeneration.
   */
  const diffFileInstance = useMemo(() => {
    if (!expanded || file.contentStatus !== 'loaded' || file.isBinary) return null;
    try {
      const oldName = file.oldFilePath ?? file.filePath;
      const instance = generateDiffFile(
        oldName,
        file.oldContent,
        file.filePath,
        file.newContent,
        file.language,
        file.language,
        { context: INITIAL_CONTEXT_LINES },
      );
      instance.initTheme('dark');
      instance.initRaw();
      instance.initSyntax();
      instance.buildSplitDiffLines();
      instance.buildUnifiedDiffLines();
      return instance;
    } catch (err: unknown) {
      console.error('[DiffFilePane] Failed to generate diff:', err);
      return null;
    }
  }, [
    expanded,
    file.contentStatus,
    file.isBinary,
    file.filePath,
    file.oldFilePath,
    file.language,
    file.oldContent,
    file.newContent,
  ]);

  /* ------ Track collapsed state via useSyncExternalStore ------ */

  /**
   * Subscribe to the DiffFile instance's internal notification system so the
   * component re-renders when hunk expand/collapse operations change the
   * `hasSomeLineCollapsed` flag. This drives the "Expand All" / "Collapse"
   * toggle in the file header.
   */
  const subscribeToCollapsed = useCallback(
    (onStoreChange: () => void) => {
      if (!diffFileInstance)
        return () => {
          /* no-op */
        };
      return diffFileInstance.subscribe(onStoreChange);
    },
    [diffFileInstance],
  );

  const getCollapsedSnapshot = useCallback(
    () => diffFileInstance?.hasSomeLineCollapsed ?? false,
    [diffFileInstance],
  );

  const hasSomeLineCollapsed = useSyncExternalStore(
    subscribeToCollapsed,
    getCollapsedSnapshot,
    getCollapsedSnapshot,
  );

  /* ------ Expand / Collapse all handler (§4.8 scroll anchor) ------ */

  const handleToggleExpandAll = useCallback(() => {
    if (!diffFileInstance) return;
    // §4.8: Save scroll anchor BEFORE the expand/collapse mutates the DOM
    saveAnchor();
    // Prevent ResizeObserver from performing its own restore while we handle it
    skipResizeRestore.current = true;
    if (hasSomeLineCollapsed) {
      diffFileInstance.onAllExpand('split');
    } else {
      diffFileInstance.onAllCollapse('split');
    }
    // §4.8: Restore on next animation frame (after React flushes DOM updates)
    requestAnimationFrame(() => {
      restoreAnchor();
      skipResizeRestore.current = false;
    });
  }, [diffFileInstance, hasSomeLineCollapsed, saveAnchor, restoreAnchor]);

  /* ------ §4.8 ResizeObserver for individual hunk expands ------ */

  /**
   * Individual hunk expand/collapse is triggered by the library's internal
   * buttons (up arrow, down arrow, expand-all-in-hunk). We cannot hook into
   * these directly, so we observe size changes on the wrapper and restore the
   * scroll anchor automatically. The `handleToggleExpandAll` above already
   * handles the "Expand All" button explicitly, but this covers the remaining
   * library-initiated DOM mutations.
   *
   * Strategy: when the wrapper height changes we treat it as an expand/collapse
   * event and restore the previously-saved anchor. The anchor is continuously
   * saved on every scroll event of the scroll container, ensuring it is always
   * up-to-date.
   */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scrollContainer = findScrollContainer(wrapper);
    if (!scrollContainer) return;

    let lastSnapshot: {
      snapshot: ScrollAnchorSnapshot;
      scrollContainer: HTMLElement;
    } | null = null;

    /**
     * Flag: when true the current scroll event was caused by
     * restoreScrollAnchor inside the ResizeObserver callback.
     * We must ignore it so we don't overwrite lastSnapshot with a
     * mid-restore position and trigger another restore cycle.
     */
    let isRestoring = false;

    // Continuously capture the scroll anchor on scroll
    const onScroll = () => {
      if (isRestoring) return; // ignore scroll caused by restore
      const snapshot = captureScrollAnchor(wrapper, scrollContainer);
      if (snapshot) {
        lastSnapshot = { snapshot, scrollContainer };
      }
    };
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });

    // Observe wrapper size changes
    const observer = new ResizeObserver(() => {
      if (!lastSnapshot) return;
      // Skip if handleToggleExpandAll is handling its own restore
      if (skipResizeRestore.current) return;

      const snap = lastSnapshot;
      lastSnapshot = null; // consume the snapshot to prevent double-restore
      isRestoring = true;
      restoreScrollAnchor(snap.scrollContainer, snap.snapshot);
      requestAnimationFrame(() => {
        isRestoring = false;
      });
    });
    observer.observe(wrapper);

    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [diffFileInstance]); // Re-attach when the diff instance changes

  /* ------ Render ------ */

  const renderPlaceholder = () => {
    if (file.contentStatus === 'loading') {
      return (
        <div className="px-4 py-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-5">
            <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-white/5" />
            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-white/5" />
            <p className="mt-4 text-sm text-slate-500">差分本文を取得しています...</p>
          </div>
        </div>
      );
    }

    if (file.contentStatus === 'idle') {
      return (
        <div className="px-4 py-8">
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
            ファイルを選択すると差分本文を取得します。
          </div>
        </div>
      );
    }

    if (file.isBinary) {
      return (
        <div className="px-4 py-8">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-5 text-sm text-amber-100">
            Binary file のため、本文プレビューは表示できません。
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 py-8">
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-5 text-sm text-red-100">
          {file.isLargeDiff
            ? 'Large diff のため本文取得に失敗したか、provider 側で差分展開が制限されています。'
            : '差分本文の取得に失敗しました。'}
        </div>
      </div>
    );
  };

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-white/10">
      {/* File header */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${getChangeTypeBadgeClass(file.changeType)}`}
        >
          {getChangeTypeLabel(file.changeType)}
        </span>
        <span className="text-sm font-medium text-slate-200">
          {file.oldFilePath && file.changeType === 'renamed'
            ? `${file.oldFilePath} → ${file.filePath}`
            : file.filePath}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-green-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </span>
        {file.threads.length > 0 && (
          <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-300">
            {file.threads.length} thread{file.threads.length > 1 ? 's' : ''}
          </span>
        )}
        {/* Expand All / Collapse toggle — only shown when the diff is loaded */}
        {diffFileInstance && (
          <button
            onClick={handleToggleExpandAll}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            title={hasSomeLineCollapsed ? 'Expand all hidden lines' : 'Collapse non-diff lines'}
          >
            {hasSomeLineCollapsed ? 'Expand all' : 'Collapse'}
          </button>
        )}
      </div>

      {/* Diff content */}
      {file.contentStatus !== 'loaded' || file.isBinary ? (
        <div>
          {renderPlaceholder()}
          {file.threads.length > 0 ? (
            <ThreadLayer threads={file.threads} onReply={onReply} />
          ) : null}
        </div>
      ) : file.isLargeDiff && !expanded ? (
        <div className="flex items-center justify-center px-4 py-8">
          <div className="text-center">
            <p className="mb-2 text-sm text-slate-400">
              Large diff — {file.additions + file.deletions} lines changed
            </p>
            <button
              onClick={() => setExpanded(true)}
              className="rounded-full bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-400/20"
            >
              Load diff
            </button>
          </div>
        </div>
      ) : diffFileInstance ? (
        <div
          ref={wrapperRef}
          data-theme="dark"
          data-file-id={file.fileId}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            touchAction: 'none',
            // Fix #4: suppress text selection while dragging
            ...(rangeStatus === 'selecting' ? { userSelect: 'none' as const } : {}),
          }}
        >
          {/* Fix #2: File-level threads displayed above the diff */}
          {fileLevelThreads.length > 0 && (
            <ThreadLayer threads={fileLevelThreads} onReply={onReply} />
          )}

          {/* Dynamic highlight for selected range */}
          {highlightStyle && <style>{highlightStyle}</style>}

          <DiffView
            diffFile={diffFileInstance}
            diffViewMode={DiffModeEnum.Split}
            diffViewWrap={false}
            diffViewTheme="dark"
            diffViewFontSize={13}
            diffViewHighlight={true}
            diffViewAddWidget={true}
            extendData={extendData}
            renderExtendLine={renderExtendLine}
            renderWidgetLine={renderWidgetLine}
          />
        </div>
      ) : expanded ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500">Failed to render diff</div>
      ) : null}
    </div>
  );
}
