import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  normalizeDiffLineSelection,
  type DiffSelectionState,
  type Poc3DiffLineSelection,
} from '../../provider-comments/diff-inline-selection';
import type { UsePublishCommentsReturn } from '../../provider-comments/use-publish-comments';
import type {
  NodeCompanionDetailSnapshot,
  NodeDetailSnapshot,
  NodeDetailViewMode,
  NodeFileContext,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import {
  buildDiffAwareSourceLines,
  type DiffAwareSourceBase,
  type DiffAwareSourceLine,
} from '../diff-aware-source-model';
import { useNodeDetailScrollTarget } from '../node-detail-scroll-target-context';
import {
  isSelectableDiffAwareLine,
  isContiguousProviderSelection,
} from '../utils/aware-line-lookup';
import {
  buildManualSelectionSourceKey,
  selectionToAnchor,
} from '../utils/manual-selection-source-key';
import { extractPoc3SourceLineInfoFromPoint } from '../utils/source-line-info';
import { buildEffectiveSource } from './build-effective-source';
import { resolveHighlightLanguage } from './highlighted-source-line';

export interface UseDiffLineSelectionProps {
  detail: NodeDetailSnapshot | NodeCompanionDetailSnapshot;
  source: DiffAwareSourceBase | null;
  publishComments: UsePublishCommentsReturn;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  fileContext: NodeFileContext | null;
  canExpandWithinFile: boolean;
}

export interface UseDiffLineSelectionReturn {
  lines: DiffAwareSourceLine[];
  language: string;
  highlighted: Set<number>;
  effectiveFilePath: string;
  selectionState: DiffSelectionState;
  activeSelection: Poc3DiffLineSelection | null;
  activeSelectableLine: DiffAwareSourceLine | null;
  composerSelection: Poc3DiffLineSelection | null;
  composerSourceKey: string | null;
  composerDraft: string;
  composerError: string;
  isComposerInFlight: boolean;
  canExpandUp: boolean;
  canExpandDown: boolean;
  handlePointerDown(event: PointerEvent<HTMLDivElement>): void;
  handlePointerMove(event: PointerEvent<HTMLDivElement>): void;
  handlePointerUp(event: PointerEvent<HTMLDivElement>): void;
  handlePointerCancel(): void;
  handleRowFocus(line: DiffAwareSourceLine): void;
  handleRowKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, line: DiffAwareSourceLine): void;
  closeComposer(): void;
  setComposerDraft(body: string): void;
  submitInlineComment(body: string): void;
  expandRange(direction: 'up' | 'down'): void;
  registerVirtualScroller(scroller: DiffLineVirtualScroller | null): void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export interface DiffLineVirtualScroller {
  scrollToNewLine(
    lineNumber: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; offset?: number },
  ): boolean;
  scrollToProviderLocation(
    side: 'LEFT' | 'RIGHT',
    providerLine: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto' },
  ): boolean;
  scrollToOverviewFindings(): boolean;
  focusLine(line: DiffAwareSourceLine): void;
}

export function useDiffLineSelection({
  detail,
  source,
  publishComments,
  viewMode,
  onViewModeChange,
  fileContext,
  canExpandWithinFile,
}: UseDiffLineSelectionProps): UseDiffLineSelectionReturn {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const virtualScrollerRef = useRef<DiffLineVirtualScroller | null>(null);
  const [scrollerReady, setScrollerReady] = useState(false);
  const scrollTarget = useNodeDetailScrollTarget();
  const handledScrollNonceRef = useRef<number | null>(null);
  const [expandedRange, setExpandedRange] = useState<{
    startLine: number;
    endLine: number;
  } | null>(null);
  const [selectionState, setSelectionState] = useState<DiffSelectionState>({
    status: 'idle',
  });
  const [selectionKeySeed, setSelectionKeySeed] = useState(0);
  const [submittedSourceKey, setSubmittedSourceKey] = useState<string | null>(null);
  const [activeSelectableIndex, setActiveSelectableIndex] = useState(0);
  const [composerDraftBySourceKey, setComposerDraftBySourceKey] = useState<Record<string, string>>(
    {},
  );
  const dragAnchorRef = useRef<{ side: 'LEFT' | 'RIGHT'; line: number } | null>(null);
  const keyboardSelectionAnchorRef = useRef<{
    side: 'LEFT' | 'RIGHT';
    line: number;
    filePath: string;
  } | null>(null);

  const functionCode = 'functionCode' in detail ? detail.functionCode : null;
  const fallbackFilePath = 'node' in detail ? detail.node.filePath : detail.summary.filePath;
  const detailIdentity =
    'nodeId' in detail ? detail.nodeId : `${detail.ownerNodeId}:${detail.relationId}`;

  const effectiveRange = useMemo(() => {
    if (!functionCode || !fileContext || !canExpandWithinFile) return null;
    if (viewMode !== 'function') {
      return { startLine: fileContext.startLine, endLine: fileContext.endLine };
    }
    return expandedRange ?? { startLine: functionCode.startLine, endLine: functionCode.endLine };
  }, [canExpandWithinFile, expandedRange, fileContext, functionCode, viewMode]);

  const effectiveSource = useMemo(
    () => buildEffectiveSource(source, fileContext, effectiveRange),
    [source, fileContext, effectiveRange],
  );

  const lines = useMemo(
    () =>
      buildDiffAwareSourceLines({
        source: effectiveSource,
        diffExcerpt: detail.diffExcerpt,
        diffSummary: detail.diffSummary,
        filePath: detail.summary.filePath ?? fallbackFilePath,
      }),
    [
      detail.diffExcerpt,
      detail.diffSummary,
      fallbackFilePath,
      detail.summary.filePath,
      effectiveSource,
    ],
  );

  const selectableLines = useMemo(
    () => lines.filter((l) => l.selectableForProviderComment),
    [lines],
  );
  const activeSelectableLine = selectableLines[activeSelectableIndex] ?? selectableLines[0] ?? null;

  const language = useMemo(
    () => resolveHighlightLanguage(effectiveSource?.filePath ?? detail.summary.filePath ?? ''),
    [detail.summary.filePath, effectiveSource?.filePath],
  );

  const highlighted = useMemo(
    () => new Set(effectiveSource?.highlightedLineNumbers ?? []),
    [effectiveSource?.highlightedLineNumbers],
  );

  const effectiveFilePath = effectiveSource?.filePath ?? detail.summary.filePath ?? '';

  const activeSelection =
    selectionState.status === 'idle' ? null : normalizeDiffLineSelection(selectionState.selection);
  const composerSelection =
    selectionState.status === 'composing'
      ? normalizeDiffLineSelection(selectionState.selection)
      : null;
  const composerSourceKey = composerSelection
    ? buildManualSelectionSourceKey(composerSelection, detail, selectionKeySeed)
    : null;
  const composerDraft = composerSourceKey
    ? (composerDraftBySourceKey[composerSourceKey] ?? '')
    : '';
  const composerError =
    composerSourceKey && publishComments
      ? (publishComments.errorByKey[composerSourceKey] ?? '')
      : '';
  const isComposerInFlight =
    composerSourceKey !== null && publishComments?.inFlightKey === composerSourceKey;
  const publishedManualSelection =
    composerSourceKey && publishComments
      ? (publishComments.publishedBySourceKey[composerSourceKey] ?? null)
      : null;

  useEffect(() => {
    setExpandedRange(null);
    setSelectionState({ status: 'idle' });
    setSubmittedSourceKey(null);
    setActiveSelectableIndex(0);
    setComposerDraftBySourceKey({});
    dragAnchorRef.current = null;
    keyboardSelectionAnchorRef.current = null;
  }, [detailIdentity, viewMode]);

  useEffect(() => {
    if (!functionCode?.startLine || !scrollContainerRef.current || viewMode === 'function') return;
    if (virtualScrollerRef.current?.scrollToNewLine(functionCode.startLine, { offset: 48 })) {
      return;
    }
    const container = scrollContainerRef.current;
    const lineEl = container.querySelector(`[data-line="${functionCode.startLine}"]`);
    if (lineEl instanceof HTMLElement) {
      const containerTop = container.getBoundingClientRect().top;
      const lineTop = lineEl.getBoundingClientRect().top;
      container.scrollTop = Math.max(0, container.scrollTop + lineTop - containerTop - 48);
    }
  }, [functionCode?.startLine, viewMode]);

  const getRowElement = (targetLine: DiffAwareSourceLine): HTMLElement | null => {
    if (!scrollContainerRef.current) return null;
    const targetSide = targetLine.side;
    const targetProviderLine =
      targetSide === 'LEFT' ? targetLine.oldLineNumber : targetLine.newLineNumber;
    if (targetSide === null || targetProviderLine === null) return null;
    return scrollContainerRef.current.querySelector<HTMLElement>(
      `[data-poc3-source-line="true"][data-side="${targetSide}"][data-line="${targetProviderLine}"]`,
    );
  };

  const focusLine = (line: DiffAwareSourceLine) => {
    if (virtualScrollerRef.current) {
      virtualScrollerRef.current.focusLine(line);
      return;
    }
    getRowElement(line)?.focus();
  };

  const handleRowFocus = useEventCallback((line: DiffAwareSourceLine) => {
    const index = selectableLines.indexOf(line);
    if (index !== -1) {
      setActiveSelectableIndex(index);
    }
  });

  const handleRowKeyDown = useEventCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, line: DiffAwareSourceLine) => {
      if (!line.selectableForProviderComment) return;
      const side = line.side;
      if (side === null) return;
      const providerLine = side === 'LEFT' ? line.oldLineNumber : line.newLineNumber;
      if (providerLine === null) return;

      // roving tabindex: ArrowDown/Up（Shift なし）でアクティブ行を移動
      if (event.key === 'ArrowDown' && !event.shiftKey) {
        event.preventDefault();
        const currentSelectableIndex = selectableLines.indexOf(line);
        const nextIndex = Math.min(currentSelectableIndex + 1, selectableLines.length - 1);
        if (nextIndex === currentSelectableIndex) return;
        const nextLine = selectableLines[nextIndex];
        setActiveSelectableIndex(nextIndex);
        focusLine(nextLine);
        return;
      }

      if (event.key === 'ArrowUp' && !event.shiftKey) {
        event.preventDefault();
        const currentSelectableIndex = selectableLines.indexOf(line);
        const prevIndex = Math.max(currentSelectableIndex - 1, 0);
        if (prevIndex === currentSelectableIndex) return;
        const prevLine = selectableLines[prevIndex];
        setActiveSelectableIndex(prevIndex);
        focusLine(prevLine);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (selectionState.status === 'idle') {
          if (composerSourceKey && composerError && publishComments) {
            publishComments.clearError(composerSourceKey);
          }
          setSelectionKeySeed((c) => c + 1);
          setSubmittedSourceKey(null);
          keyboardSelectionAnchorRef.current = {
            side,
            line: providerLine,
            filePath: line.filePath,
          };
          setSelectionState({
            status: 'selecting',
            selection: {
              filePath: line.filePath,
              oldPath: null,
              side,
              startLine: providerLine,
              endLine: providerLine,
            },
          });
        } else if (selectionState.status === 'selecting') {
          const anchor = keyboardSelectionAnchorRef.current;
          const selection = normalizeDiffLineSelection({
            filePath: anchor?.filePath ?? line.filePath,
            oldPath: null,
            side: anchor?.side ?? side,
            startLine: anchor?.line ?? providerLine,
            endLine: providerLine,
          });
          if (isContiguousProviderSelection(lines, selection)) {
            setSelectionState({ status: 'composing', selection, actionKind: 'publish-comment' });
            keyboardSelectionAnchorRef.current = null;
          }
        }
        return;
      }

      if (event.key === 'ArrowDown' && event.shiftKey) {
        event.preventDefault();
        const currentLineIndex = lines.indexOf(line);
        const nextLine = lines
          .slice(currentLineIndex + 1)
          .find((l) => l.selectableForProviderComment && l.side === side);
        if (!nextLine) return;
        const nextProviderLine =
          nextLine.side === 'LEFT' ? nextLine.oldLineNumber : nextLine.newLineNumber;
        if (nextProviderLine === null) return;

        const anchor = selectionState.status === 'idle' ? null : keyboardSelectionAnchorRef.current;
        const anchorLine = anchor?.line ?? providerLine;
        const candidateSelection = normalizeDiffLineSelection({
          filePath: anchor?.filePath ?? line.filePath,
          oldPath: null,
          side: anchor?.side ?? side,
          startLine: anchorLine,
          endLine: nextProviderLine,
        });
        if (!isContiguousProviderSelection(lines, candidateSelection)) return;

        if (selectionState.status === 'idle') {
          if (composerSourceKey && composerError && publishComments) {
            publishComments.clearError(composerSourceKey);
          }
          setSelectionKeySeed((c) => c + 1);
          setSubmittedSourceKey(null);
          keyboardSelectionAnchorRef.current = {
            side,
            line: providerLine,
            filePath: line.filePath,
          };
          setSelectionState({ status: 'selecting', selection: candidateSelection });
        } else if (selectionState.status === 'selecting') {
          setSelectionState({ status: 'selecting', selection: candidateSelection });
        }
        const nextSelectableIndex = selectableLines.indexOf(nextLine);
        if (nextSelectableIndex !== -1) setActiveSelectableIndex(nextSelectableIndex);
        focusLine(nextLine);
        return;
      }

      if (event.key === 'ArrowUp' && event.shiftKey) {
        event.preventDefault();
        const currentLineIndex = lines.indexOf(line);
        const prevLine = lines
          .slice(0, currentLineIndex)
          .reverse()
          .find((l) => l.selectableForProviderComment && l.side === side);
        if (!prevLine) return;
        const prevProviderLine =
          prevLine.side === 'LEFT' ? prevLine.oldLineNumber : prevLine.newLineNumber;
        if (prevProviderLine === null) return;

        const anchor = selectionState.status === 'idle' ? null : keyboardSelectionAnchorRef.current;
        const anchorLine = anchor?.line ?? providerLine;
        const candidateSelection = normalizeDiffLineSelection({
          filePath: anchor?.filePath ?? line.filePath,
          oldPath: null,
          side: anchor?.side ?? side,
          startLine: prevProviderLine,
          endLine: anchorLine,
        });
        if (!isContiguousProviderSelection(lines, candidateSelection)) return;

        if (selectionState.status === 'idle') {
          if (composerSourceKey && composerError && publishComments) {
            publishComments.clearError(composerSourceKey);
          }
          setSelectionKeySeed((c) => c + 1);
          setSubmittedSourceKey(null);
          keyboardSelectionAnchorRef.current = {
            side,
            line: providerLine,
            filePath: line.filePath,
          };
          setSelectionState({ status: 'selecting', selection: candidateSelection });
        } else if (selectionState.status === 'selecting') {
          setSelectionState({ status: 'selecting', selection: candidateSelection });
        }
        const prevSelectableIndex = selectableLines.indexOf(prevLine);
        if (prevSelectableIndex !== -1) setActiveSelectableIndex(prevSelectableIndex);
        focusLine(prevLine);
        return;
      }

      if (event.key === 'Escape' && selectionState.status === 'selecting') {
        event.stopPropagation();
        keyboardSelectionAnchorRef.current = null;
        setSelectionState({ status: 'idle' });
      }
    },
  );

  useEffect(() => {
    if (!publishedManualSelection || submittedSourceKey !== composerSourceKey) return;
    setComposerDraftBySourceKey((current) => {
      if (!composerSourceKey) return current;
      const next = { ...current };
      delete next[composerSourceKey];
      return next;
    });
    setSelectionState({ status: 'idle' });
    setSubmittedSourceKey(null);
  }, [composerSourceKey, publishedManualSelection, submittedSourceKey]);

  useEffect(() => {
    if (selectionState.status !== 'composing') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (composerSourceKey && composerError && publishComments) {
          publishComments.clearError(composerSourceKey);
        }
        setSubmittedSourceKey(null);
        setSelectionState({ status: 'idle' });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [composerError, composerSourceKey, publishComments, selectionState.status]);

  const handlePointerDown = useEventCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const info = extractPoc3SourceLineInfoFromPoint(event.clientX, event.clientY);
    if (!info || !isSelectableDiffAwareLine(lines, info)) return;

    event.preventDefault();
    if (composerSourceKey && composerError && publishComments) {
      publishComments.clearError(composerSourceKey);
    }
    setSelectionKeySeed((current) => current + 1);
    setSubmittedSourceKey(null);
    dragAnchorRef.current = { side: info.side, line: info.line };
    setSelectionState({
      status: 'selecting',
      selection: {
        filePath: info.filePath,
        oldPath: null,
        side: info.side,
        startLine: info.line,
        endLine: info.line,
      },
    });
  });

  const handlePointerMove = useEventCallback((event: PointerEvent<HTMLDivElement>) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    const info = extractPoc3SourceLineInfoFromPoint(event.clientX, event.clientY);
    if (!info || info.side !== anchor.side || !isSelectableDiffAwareLine(lines, info)) return;

    setSelectionState((prev) => {
      if (prev.status !== 'selecting') return prev;
      const next = normalizeDiffLineSelection({
        ...prev.selection,
        startLine: anchor.line,
        endLine: info.line,
      });
      if (prev.selection.startLine === next.startLine && prev.selection.endLine === next.endLine) {
        return prev;
      }
      return { status: 'selecting', selection: next };
    });
  });

  const handlePointerUp = useEventCallback((event: PointerEvent<HTMLDivElement>) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    dragAnchorRef.current = null;
    const info = extractPoc3SourceLineInfoFromPoint(event.clientX, event.clientY);
    setSelectionState((prev) => {
      const endLine =
        info && info.side === anchor.side
          ? info.line
          : prev.status === 'selecting'
            ? prev.selection.endLine
            : anchor.line;
      const selection = normalizeDiffLineSelection({
        filePath: info?.filePath ?? (prev.status === 'selecting' ? prev.selection.filePath : ''),
        oldPath: null,
        side: anchor.side,
        startLine: anchor.line,
        endLine,
      });
      if (!isContiguousProviderSelection(lines, selection)) {
        return { status: 'idle' };
      }
      return { status: 'composing', selection, actionKind: 'publish-comment' };
    });
  });

  const handlePointerCancel = useEventCallback(() => {
    dragAnchorRef.current = null;
    setSelectionState({ status: 'idle' });
  });

  const closeComposer = useEventCallback(() => {
    if (composerSourceKey && composerError && publishComments) {
      publishComments.clearError(composerSourceKey);
    }
    if (composerSourceKey) {
      setComposerDraftBySourceKey((current) => {
        const next = { ...current };
        delete next[composerSourceKey];
        return next;
      });
    }
    setSubmittedSourceKey(null);
    setSelectionState({ status: 'idle' });
  });

  const setComposerDraft = useEventCallback((body: string) => {
    if (!composerSourceKey) return;
    setComposerDraftBySourceKey((current) => ({ ...current, [composerSourceKey]: body }));
  });

  const submitInlineComment = useEventCallback((body: string) => {
    if (!composerSelection || !composerSourceKey || !publishComments) return;
    setSubmittedSourceKey(composerSourceKey);
    void publishComments.publishInlineComment({
      reviewWorkspaceId: detail.reviewWorkspaceId,
      revisionId: detail.revisionId,
      body,
      anchor: selectionToAnchor(composerSelection),
      source: { kind: 'manual-selection' },
      sourceKey: composerSourceKey,
    });
  });

  const canExpandUp =
    canExpandWithinFile &&
    viewMode === 'function' &&
    effectiveRange !== null &&
    fileContext !== null &&
    effectiveRange.startLine > fileContext.startLine;
  const canExpandDown =
    canExpandWithinFile &&
    viewMode === 'function' &&
    effectiveRange !== null &&
    fileContext !== null &&
    effectiveRange.endLine < fileContext.endLine;

  const expandRange = useEventCallback((direction: 'up' | 'down') => {
    if (!functionCode || !fileContext || !effectiveRange) return;
    const next =
      direction === 'up'
        ? {
            startLine: Math.max(fileContext.startLine, effectiveRange.startLine - 20),
            endLine: effectiveRange.endLine,
          }
        : {
            startLine: effectiveRange.startLine,
            endLine: Math.min(fileContext.endLine, effectiveRange.endLine + 20),
          };
    setExpandedRange(next);
    onViewModeChange('function');
  });

  const registerVirtualScroller = useEventCallback((scroller: DiffLineVirtualScroller | null) => {
    virtualScrollerRef.current = scroller;
    setScrollerReady(scroller !== null);
  });

  useEffect(() => {
    if (!scrollerReady || !scrollTarget) return;
    if (handledScrollNonceRef.current === scrollTarget.nonce) return;

    let providerLine: number | null = null;
    let providerSide: 'LEFT' | 'RIGHT' | null = null;
    let isOverview = false;

    if (scrollTarget.kind === 'agent-thread') {
      const finding = detail.findings.find(
        (entry) => entry.localThreadId === scrollTarget.localThreadId,
      );
      if (!finding) return;
      if (finding.line === null) {
        isOverview = true;
      } else {
        providerLine = finding.endLine ?? finding.line;
        providerSide = finding.side === 'old' ? 'LEFT' : 'RIGHT';
      }
    } else {
      const thread = detail.threads.remote.find(
        (entry) => entry.providerThreadId === scrollTarget.providerThreadId,
      );
      if (!thread || thread.location.kind !== 'diff') return;
      providerLine = thread.location.endLine ?? thread.location.startLine;
      providerSide = thread.location.side;
    }

    handledScrollNonceRef.current = scrollTarget.nonce;
    const scroller = virtualScrollerRef.current;
    if (!scroller) return;

    if (isOverview) {
      scroller.scrollToOverviewFindings();
      return;
    }
    if (providerSide !== null && providerLine !== null) {
      scroller.scrollToProviderLocation(providerSide, providerLine);
    }
  }, [detail.findings, detail.threads.remote, scrollTarget, scrollerReady]);

  return {
    lines,
    language,
    highlighted,
    effectiveFilePath,
    selectionState,
    activeSelection,
    activeSelectableLine,
    composerSelection,
    composerSourceKey,
    composerDraft,
    composerError,
    isComposerInFlight,
    canExpandUp,
    canExpandDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleRowFocus,
    handleRowKeyDown,
    closeComposer,
    setComposerDraft,
    submitInlineComment,
    expandRange,
    registerVirtualScroller,
    scrollContainerRef,
  };
}

function useEventCallback<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
): (...args: Args) => Return {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback((...args: Args) => callbackRef.current(...args), []);
}
