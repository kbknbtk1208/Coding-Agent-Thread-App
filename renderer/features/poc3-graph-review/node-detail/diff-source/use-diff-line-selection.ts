import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  normalizeDiffLineSelection,
  type DiffSelectionState,
  type Poc3DiffLineSelection,
} from '../../provider-comments/diff-inline-selection';
import type { UsePublishCommentsReturn } from '../../provider-comments/use-publish-comments';
import type {
  NodeDetailSnapshot,
  NodeDetailViewMode,
  NodeFileContext,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { DiffAwareSourceLine } from '../diff-aware-source-model';
import type { Poc3PublishedCommentRecord } from '../../../../../shared/poc3-domain/comment-publish';
import {
  isSelectableDiffAwareLine,
  isContiguousProviderSelection,
} from '../utils/aware-line-lookup';
import { buildManualSelectionSourceKey } from '../utils/manual-selection-source-key';
import { escapeCssIdentifier } from '../utils/format';
import { extractPoc3SourceLineInfoFromPoint } from '../utils/source-line-info';

export interface UseDiffLineSelectionProps {
  detail: NodeDetailSnapshot;
  lines: DiffAwareSourceLine[];
  publishComments: UsePublishCommentsReturn;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  fileContext: NodeFileContext | null;
  canExpandWithinFile: boolean;
  effectiveRange: { startLine: number; endLine: number } | null;
}

export interface UseDiffLineSelectionReturn {
  selectionState: DiffSelectionState;
  expandedRange: { startLine: number; endLine: number } | null;
  composerSelection: Poc3DiffLineSelection | null;
  composerSourceKey: string | null;
  composerError: string;
  isComposerInFlight: boolean;
  publishedManualSelection: Poc3PublishedCommentRecord | null;
  selectionHighlightStyle: string;
  canExpandUp: boolean;
  canExpandDown: boolean;
  handlePointerDown(event: PointerEvent<HTMLDivElement>): void;
  handlePointerMove(event: PointerEvent<HTMLDivElement>): void;
  handlePointerUp(event: PointerEvent<HTMLDivElement>): void;
  handlePointerCancel(): void;
  closeComposer(): void;
  expandRange(direction: 'up' | 'down'): void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useDiffLineSelection({
  detail,
  lines,
  publishComments,
  viewMode,
  onViewModeChange,
  fileContext,
  canExpandWithinFile,
  effectiveRange,
}: UseDiffLineSelectionProps): UseDiffLineSelectionReturn {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [expandedRange, setExpandedRange] = useState<{
    startLine: number;
    endLine: number;
  } | null>(null);
  const [selectionState, setSelectionState] = useState<DiffSelectionState>({
    status: 'idle',
  });
  const [selectionKeySeed, setSelectionKeySeed] = useState(0);
  const [submittedSourceKey, setSubmittedSourceKey] = useState<string | null>(null);
  const dragAnchorRef = useRef<{ side: 'LEFT' | 'RIGHT'; line: number } | null>(null);

  const functionCode = detail.functionCode;

  const activeSelection =
    selectionState.status === 'idle' ? null : normalizeDiffLineSelection(selectionState.selection);
  const composerSelection =
    selectionState.status === 'composing'
      ? normalizeDiffLineSelection(selectionState.selection)
      : null;
  const composerSourceKey = composerSelection
    ? buildManualSelectionSourceKey(composerSelection, detail, selectionKeySeed)
    : null;
  const composerError =
    composerSourceKey && publishComments
      ? (publishComments.errorByKey[composerSourceKey] ?? '')
      : '';
  const isComposerInFlight =
    composerSourceKey !== null && publishComments?.inFlightKey === composerSourceKey;
  const publishedManualSelection: Poc3PublishedCommentRecord | null =
    composerSourceKey && publishComments
      ? (publishComments.publishedBySourceKey[composerSourceKey] ?? null)
      : null;

  useEffect(() => {
    setExpandedRange(null);
    setSelectionState({ status: 'idle' });
    setSubmittedSourceKey(null);
    dragAnchorRef.current = null;
  }, [detail.nodeId, viewMode]);

  useEffect(() => {
    if (!functionCode?.startLine || !scrollContainerRef.current || viewMode === 'function') return;
    const container = scrollContainerRef.current;
    const lineEl = container.querySelector(`[data-line="${functionCode.startLine}"]`);
    if (lineEl instanceof HTMLElement) {
      const containerTop = container.getBoundingClientRect().top;
      const lineTop = lineEl.getBoundingClientRect().top;
      container.scrollTop = Math.max(0, container.scrollTop + lineTop - containerTop - 48);
    }
  }, [functionCode?.startLine, viewMode]);

  const selectionHighlightStyle = useMemo(() => {
    if (!activeSelection) return '';
    const startLine = Math.min(activeSelection.startLine, activeSelection.endLine);
    const endLine = Math.max(activeSelection.startLine, activeSelection.endLine);
    const selectors: string[] = [];
    const escapedPath = escapeCssIdentifier(activeSelection.filePath);
    const scope = `[data-poc3-source-file-path="${escapedPath}"]`;
    for (let line = startLine; line <= endLine; line++) {
      selectors.push(
        `${scope} [data-poc3-source-line="true"][data-side="${activeSelection.side}"][data-line="${line}"]`,
      );
    }
    if (selectors.length === 0) return '';
    return `${selectors.join(',\n')} { background-color: rgba(216, 224, 113, 0.18) !important; box-shadow: inset 3px 0 0 rgba(216, 224, 113, 0.62); }`;
  }, [activeSelection]);

  useEffect(() => {
    if (!publishedManualSelection || submittedSourceKey !== composerSourceKey) return;
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

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
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
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
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
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
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
  };

  const handlePointerCancel = () => {
    dragAnchorRef.current = null;
    setSelectionState({ status: 'idle' });
  };

  const closeComposer = () => {
    if (composerSourceKey && composerError && publishComments) {
      publishComments.clearError(composerSourceKey);
    }
    setSubmittedSourceKey(null);
    setSelectionState({ status: 'idle' });
  };

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

  const expandRange = (direction: 'up' | 'down') => {
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
  };

  return {
    selectionState,
    expandedRange,
    composerSelection,
    composerSourceKey,
    composerError,
    isComposerInFlight,
    publishedManualSelection,
    selectionHighlightStyle,
    canExpandUp,
    canExpandDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    closeComposer,
    expandRange,
    scrollContainerRef,
  };
}
